import { database, FirebaseError, storage } from "firebase-admin";
import * as functions from "firebase-functions";

export default functions.firestore
  .document("DirectMessages/{chatId}")
  .onDelete(async (change, context) => {
    const { chatId } = context.params;
    const updates: { [key: string]: any } = {};

    const { membersList } = change.data();

    // ! Conversación eliminada
    // todo: eliminar reflejo de la conversación en realtime db
    // todo: eliminar mensajes de la conversación
    updates[`directMessages/${chatId}`] = null;
    for (const member of membersList) {
      updates[`users/${member}/notifications/dm/${chatId}`] = null;
    }

    try {
      await storage()
        .bucket()
        .deleteFiles({
          prefix: `directMessages/${chatId}`,
        });
      await database().ref().update(updates);
    } catch (error) {
      const { code, message } = error as FirebaseError;
      throw new functions.https.HttpsError(
        "unknown",
        JSON.stringify({ code, message })
      );
    }
  });
