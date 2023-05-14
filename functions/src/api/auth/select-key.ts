import {
  IOrganizationKey,
  RoleAccessLevels,
} from "@cuttinboard-solutions/types-helpers";
import { auth, firestore } from "firebase-admin";
import { employeeDocConverter } from "../../models/converters/employeeConverter";
import { updateUserMetadata } from "../../services/updateUserMetadata";
import { locationConverter } from "../../models/converters/locationConverter";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v1";

interface SelectKeyData {
  organizationId: string;
  locationId: string;
  timestamp: number;
}

/**
 * Select a key for a user to access a location or organization.
 */
export default onCall<SelectKeyData>(async (event) => {
  const { organizationId, locationId, timestamp } = event.data;
  const authentication = event.auth;

  // Check that the user is authenticated.
  if (!authentication) {
    throw new HttpsError(
      "failed-precondition",
      "The function must be called while authenticated."
    );
  }

  // Organization ID is required and must be a string.
  if (!organizationId || typeof organizationId !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "A valid organization ID is required as input to this function. The organization ID must be a string."
    );
  }

  // Location ID is required and must be a string.
  if (!locationId || typeof locationId !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "A valid location ID is required as input to this function. The location ID must be a string."
    );
  }

  // Get the user's ID.
  const { uid } = authentication;

  let organizationKey: IOrganizationKey | undefined;

  try {
    // Get the user's organization key
    const locationDocumentSnapshot = await firestore()
      .collection("Locations")
      .doc(locationId)
      .withConverter(locationConverter)
      .get();
    const locationData = locationDocumentSnapshot.data();

    if (!locationData) {
      // Throw an error if the user does not have access to the location
      throw new HttpsError(
        "failed-precondition",
        "The location document does not exist in the database."
      );
    }

    const { organizationId: locationOrganizationId, supervisors } =
      locationData;

    if (locationOrganizationId !== organizationId) {
      // Throw an error if the user does not have access to the location
      throw new HttpsError(
        "failed-precondition",
        "The organization ID does not match the location's organization ID."
      );
    }

    if (locationOrganizationId === uid) {
      // The user is the organization owner
      organizationKey = {
        role: RoleAccessLevels.OWNER,
        orgId: organizationId,
        locId: locationId,
      };
    } else if (supervisors && supervisors.includes(uid)) {
      // The user is a supervisor
      organizationKey = {
        role: RoleAccessLevels.ADMIN,
        orgId: organizationId,
        locId: locationId,
      };
    } else {
      // Get the user's location key
      const employeeLocationProfilesSnap = await firestore()
        .collection("Locations")
        .doc(locationId)
        .collection("employees")
        .doc("employeesDocument")
        .withConverter(employeeDocConverter)
        .get();
      const employeeLocationProfiles = employeeLocationProfilesSnap.data();

      if (!employeeLocationProfiles) {
        // Throw an error if the user does not have access to the location
        throw new HttpsError(
          "failed-precondition",
          "The user does not have access to the location."
        );
      }

      const employeeLocationProfile = employeeLocationProfiles.employees?.[uid];

      if (!employeeLocationProfile) {
        // Throw an error if the user does not have access to the location
        throw new HttpsError(
          "failed-precondition",
          "The user does not have access to the location."
        );
      }

      const { role, positions } = employeeLocationProfile;

      organizationKey = {
        role,
        pos: positions,
        orgId: organizationId,
        locId: locationId,
      };
    }

    // Set the new key on the user's claims to grant access to the corresponding resources
    await auth().setCustomUserClaims(uid, { organizationKey });

    // Update the user's claims in the database
    await updateUserMetadata({ uid, refreshTime: timestamp });

    // Return the result to the client.
    return { organizationKey };
  } catch (error: any) {
    logger.error(error);
    throw new HttpsError("unknown", error.message);
  }
});
