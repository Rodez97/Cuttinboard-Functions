import { database, FirebaseError, firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { clearUserClaims } from "../../../../services/auth";
import { updateEmployeeConversations } from "../../../../services/employees";

export default functions.firestore
  .document("/Organizations/{organizationId}/employees/{employeeId}")
  .onDelete(async (snapshot, context) => {
    const { organizationId, employeeId } = context.params;
    const { locations, supervisingLocations } = snapshot.data();
    const batch = firestore().batch();
    const updates: { [key: string]: any } = {};

    if (locations) {
      for (const loc of Object.keys(locations)) {
        batch.update(firestore().collection("Locations").doc(loc), {
          members: firestore.FieldValue.arrayRemove(employeeId),
        });
        updates[
          `users/${employeeId}/notifications/organizations/${organizationId}/locations/${loc}`
        ] = null;
      }
    }

    if (supervisingLocations) {
      for (const loc of supervisingLocations) {
        batch.update(firestore().collection("Locations").doc(loc), {
          supervisors: firestore.FieldValue.arrayRemove(employeeId),
        });
      }
    }

    batch.update(firestore().collection("Users").doc(employeeId), {
      organizations: firestore.FieldValue.arrayRemove(organizationId),
    });

    try {
      await batch.commit();
      await database().ref().update(updates);
      await updateEmployeeConversations(
        organizationId,
        employeeId,
        locations,
        null
      );
      await clearUserClaims([employeeId], organizationId);
    } catch (error) {
      const { code, message } = error as FirebaseError;
      throw new functions.https.HttpsError(
        "failed-precondition",
        JSON.stringify({ code, message })
      );
    }
  });
