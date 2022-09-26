import { database, storage } from "firebase-admin";
import * as functions from "firebase-functions";

export default functions.firestore
  .document("DirectMessages/{chatId}")
  .onDelete(async (change, context) => {
    const { chatId } = context.params;
    const updates: { [key: string]: any } = {};

    const { members } = change.data();

    // ! Conversación eliminada
    // todo: eliminar reflejo de la conversación en realtime db
    // todo: eliminar mensajes de la conversación
    updates[`directMessages/${chatId}`] = null;
    for (const member of members) {
      updates[`users/${member}/notifications/dm/dm_${chatId}`] = null;
    }

    try {
      await storage()
        .bucket()
        .deleteFiles({
          prefix: `directMessages/${chatId}`,
        });
      await database().ref().update(updates);
    } catch (error) {
      throw new Error("An error occurred updating this chat");
    }
  });
