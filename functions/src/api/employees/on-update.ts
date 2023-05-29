import {
  IOrganizationEmployee,
  IOrganizationKey,
} from "@cuttinboard-solutions/types-helpers";
import { auth, firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { difference, isEqual } from "lodash";
import { updateUserMetadata } from "../../services/updateUserMetadata";

export default functions.firestore
  .document("/Organizations/{orgId}/employees/{employeeId}")
  .onUpdate(async (snapshot, context) => {
    const { orgId, employeeId } = context.params;

    // Get the employee data before the update (b prefix stands for before).
    const { supervisingLocations: bSupervisingLocations } =
      snapshot.before.data() as IOrganizationEmployee;

    // Get the employee data after the update.
    const { supervisingLocations } =
      snapshot.after.data() as IOrganizationEmployee;

    if (isEqual(bSupervisingLocations, supervisingLocations)) {
      return;
    }

    // Create a batch
    const bulkWriter = firestore().bulkWriter();

    // Get the locations that were removed
    const removedLocations = difference(
      bSupervisingLocations ?? [],
      supervisingLocations ?? []
    );

    // Get the locations that were added
    const addedLocations = difference(
      supervisingLocations ?? [],
      bSupervisingLocations ?? []
    );

    for (const locationId of removedLocations) {
      // Remove the employee from the 'members' field of the location document
      bulkWriter.update(firestore().collection("Locations").doc(locationId), {
        members: firestore.FieldValue.arrayRemove(employeeId),
        supervisors: firestore.FieldValue.arrayRemove(employeeId),
      });

      bulkWriter.update(
        firestore()
          .collection("Locations")
          .doc(locationId)
          .collection("employees")
          .doc("employeesDocument"),
        `employees.${employeeId}`,
        firestore.FieldValue.delete()
      );
    }

    for (const locationId of addedLocations) {
      // Remove the employee from the 'members' field of the location document
      bulkWriter.update(firestore().collection("Locations").doc(locationId), {
        supervisors: firestore.FieldValue.arrayUnion(employeeId),
      });
    }

    try {
      // Commit the batch
      await bulkWriter.close();

      await updateClaims(snapshot.after.id, orgId, removedLocations);
    } catch (error: any) {
      functions.logger.error(error);
      throw new functions.https.HttpsError("unknown", error.message);
    }
  });

async function updateClaims(
  employeeId: string,
  organization: string,
  removedLocations: string[]
) {
  const { customClaims } = await auth().getUser(employeeId);
  if (!customClaims) {
    // If the user doesn't have any claims, we don't need to update them
    return;
  }
  const organizationKey: IOrganizationKey | undefined =
    customClaims.organizationKey;
  if (!organizationKey) {
    // If the user doesn't have any organization key or the organization key is the same, we don't need to update it
    return;
  }

  const { orgId, locId } = organizationKey;

  if (orgId !== organization) {
    // If the user doesn't have any organization key or the organization key is the same, we don't need to update it
    return;
  }

  if (removedLocations.includes(locId)) {
    // Update the user's claims
    await auth().setCustomUserClaims(employeeId, null);

    // Update the user's claims in the database
    await updateUserMetadata({ uid: employeeId });
  }
}
