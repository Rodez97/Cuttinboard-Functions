import { FirebaseError, firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { updateEmployeeConversations } from "../../../../services/employees";

export default functions.firestore
  .document("/Organizations/{organizationId}/employees/{employeeId}")
  .onCreate(async (snapshot, context) => {
    const { organizationId, employeeId } = context.params;
    const { locations } = snapshot.data();

    const batch = firestore().batch();

    batch.update(firestore().collection("Users").doc(employeeId), {
      organizations: firestore.FieldValue.arrayUnion(organizationId),
    });

    if (locations) {
      for (const loc of Object.keys(locations)) {
        batch.update(firestore().collection("Locations").doc(loc), {
          members: firestore.FieldValue.arrayUnion(employeeId),
        });
      }
    }

    try {
      await batch.commit();
      if (locations) {
        await updateEmployeeConversations(
          organizationId,
          employeeId,
          null,
          locations
        );
      }
    } catch (error) {
      const { code, message } = error as FirebaseError;
      throw new functions.https.HttpsError(
        "failed-precondition",
        JSON.stringify({ code, message })
      );
    }
  });
