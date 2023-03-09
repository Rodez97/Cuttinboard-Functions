import { IOrganizationEmployee } from "@cuttinboard-solutions/types-helpers";
import { database, firestore, storage } from "firebase-admin";
import * as functions from "firebase-functions";
import { clearUserClaims } from "../../../../services/auth";
import { handleError } from "../../../../services/handleError";

export default functions.firestore
  .document("/Organizations/{organizationId}/employees/{employeeId}")
  .onDelete(async (snapshot, context) => {
    // Get the organization ID and employee ID from the function's parameters
    const { organizationId, employeeId } = context.params;
    // Get the employee's data from the snapshot
    const { supervisingLocations } = snapshot.data() as IOrganizationEmployee;

    try {
      // Create a batch to group all the updates
      const bulkWriter = firestore().bulkWriter();

      // If the employee is a member of any locations
      if (supervisingLocations && supervisingLocations.length > 0) {
        // For each location that the employee is a member of
        for (const locationId of supervisingLocations) {
          // Remove the employee from the 'members' field of the location document
          bulkWriter.update(
            firestore().collection("Locations").doc(locationId),
            {
              members: firestore.FieldValue.arrayRemove(employeeId),
              supervisors: firestore.FieldValue.arrayRemove(employeeId),
            }
          );

          bulkWriter.delete(
            firestore()
              .collection("Locations")
              .doc(locationId)
              .collection("employees")
              .doc(employeeId)
          );
        }
      }

      // Remove the organization from the 'organizations' field of the user document
      bulkWriter.update(firestore().collection("Users").doc(employeeId), {
        organizations: firestore.FieldValue.arrayRemove(organizationId),
      });

      // Commit the batch to apply the updates
      await bulkWriter.close();

      // Remove the organization's notifications from the user's notifications object
      await database()
        .ref(
          `users/${employeeId}/notifications/organizations/${organizationId}`
        )
        .remove();

      // Delete the employee's files from storage
      await storage()
        .bucket()
        .deleteFiles({
          prefix: `organizations/${organizationId}/employees/${employeeId}`,
        });

      // Clear the user's custom claims for the organization
      await clearUserClaims([employeeId], organizationId);
    } catch (error) {
      // Handle any errors that may occur during the update process
      handleError(error);
    }
  });
