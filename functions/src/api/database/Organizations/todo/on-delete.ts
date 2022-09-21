import { FirebaseError, firestore } from "firebase-admin";
import * as functions from "firebase-functions";

export default functions.firestore
  .document(`/Organizations/{organizationId}/todo/{boardId}`)
  .onDelete(async (board) => {
    const drawerData = board.data();
    const { locationId } = drawerData;

    if (!locationId) {
      return;
    }

    // Borrar todas las subcolecciones de esta pizarra / app
    try {
      await firestore().recursiveDelete(board.ref);
    } catch (error) {
      const { code, message } = error as FirebaseError;
      throw new functions.https.HttpsError(
        "failed-precondition",
        JSON.stringify({ code, message })
      );
    }
  });
