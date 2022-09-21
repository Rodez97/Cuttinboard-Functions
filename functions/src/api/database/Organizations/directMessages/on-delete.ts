import { database, storage } from "firebase-admin";
import * as functions from "firebase-functions";

export default functions.firestore
  .document("Organizations/{organizationId}/directMessages/{chatId}")
  .onDelete(async (change, context) => {
    const { organizationId, chatId } = context.params;
    const updates: { [key: string]: any } = {};

    const { locationId, members } = change.data();

    // ! Conversación eliminada
    // todo: eliminar reflejo de la conversación en realtime db
    // todo: eliminar mensajes de la conversación
    updates[`chatMessages/${organizationId}/${locationId}/${chatId}`] = null;
    for (const member of members) {
      updates[`users/${member}/notifications/${locationId}/dm_${chatId}`] =
        null;
    }

    try {
      await storage()
        .bucket()
        .deleteFiles({
          prefix: `organizations/${organizationId}/locations/${locationId}/chatMessages/${chatId}`,
        });
      await database().ref().update(updates);
    } catch (error) {
      throw new Error("An error occurred updating this chat");
    }
  });
