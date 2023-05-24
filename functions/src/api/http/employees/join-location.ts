import {
  IOrganizationKey,
  RoleAccessLevels,
} from "@cuttinboard-solutions/types-helpers";
import { firestore } from "firebase-admin";
import { orgEmployeeConverter } from "../../../models/converters/employeeConverter";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { cuttinboardUserConverter } from "../../../models/converters/cuttinboardUserConverter";
import { logger } from "firebase-functions/v1";
import { locationConverter } from "../../../models/converters/locationConverter";

/**
 * Add a new employee to the organization or location
 */
export default onCall<string>(async (request) => {
  const { auth, data: locationId } = request;

  if (!auth) {
    // If the user is not authenticated then return an error
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  if (!locationId) {
    // If the locationId is not provided then return an error
    throw new HttpsError(
      "invalid-argument",
      "In order to join a location you must provide a locationId."
    );
  }

  // Get the access key from the auth token.
  const organizationKey: IOrganizationKey | undefined =
    auth.token?.organizationKey;

  if (!organizationKey) {
    // If the access key is not provided then return an error
    throw new HttpsError(
      "invalid-argument",
      "The function must be called with a valid access key."
    );
  }

  // Extract the access data from the access key for the user that is inviting the employee.
  const { role, locId, orgId } = organizationKey;

  if (locId !== locationId) {
    // If the locationId provided does not match the locationId from the access key then return an error
    throw new HttpsError(
      "invalid-argument",
      "The locationId provided does not match the locationId from the access key."
    );
  }

  if (role > RoleAccessLevels.ADMIN) {
    //  If the user who wants to join the location is not an owner then return an error
    throw new HttpsError(
      "permission-denied",
      "You can not join a location unless you are an owner or admin."
    );
  }

  try {
    // Check if the location exists
    const location = await firestore()
      .collection("Locations")
      .doc(locationId)
      .withConverter(locationConverter)
      .get();
    const locationData = location.data();

    if (!locationData) {
      throw new HttpsError("failed-precondition", "Location not found");
    }

    const { members, limits } = locationData;
    const membersCount = members ? members.length : 0;

    if (membersCount >= limits.employees) {
      throw new HttpsError(
        "failed-precondition",
        "You have reached the maximum number of employees for this location"
      );
    }

    // Get Employee document
    const employeeSnap = await firestore()
      .collection("Organizations")
      .doc(orgId)
      .collection("employees")
      .doc(auth.uid)
      .withConverter(orgEmployeeConverter)
      .get();
    const employee = employeeSnap.data();

    if (!employee) {
      // If the employee is not registered then return an error
      throw new HttpsError("not-found", "The employee is not registered.");
    }

    const bulkWriter = firestore().bulkWriter();

    // Add the document to the location employees collection
    bulkWriter.set(
      firestore()
        .collection("Locations")
        .doc(locationId)
        .collection("employees")
        .doc("employeesDocument"),
      {
        employees: {
          [auth.uid]: employee,
        },
      },
      { merge: true }
    );

    // Add the employee to the members array in the location document
    bulkWriter.update(
      firestore().collection("Locations").doc(locationId),
      "members",
      firestore.FieldValue.arrayUnion(auth.uid)
    );

    // Add the location to the employee's locations array
    bulkWriter.set(
      firestore()
        .collection("Users")
        .doc(auth.uid)
        .withConverter(cuttinboardUserConverter),
      {
        locations: firestore.FieldValue.arrayUnion(locationId),
        organizations: firestore.FieldValue.arrayUnion(orgId),
        organizationsRelationship: {
          [orgId]: firestore.FieldValue.arrayUnion(locationId),
        },
      },
      { merge: true }
    );

    // Commit the batch
    await bulkWriter.close();
  } catch (error: any) {
    logger.error(error);
    throw new HttpsError("unknown", error.message);
  }
});
