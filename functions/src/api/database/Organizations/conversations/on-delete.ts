import { database, storage } from "firebase-admin";
import * as functions from "firebase-functions";

/**
 * En caso de eliminar una conversación, limpiar los mensajes y la lista de miembros de Realtime Database
 */
export default functions.firestore
  .document("Organizations/{organizationId}/conversations/{conversationId}")
  .onDelete(async (change, context) => {
    const { organizationId, conversationId } = context.params;
    const { locationId, members } = change.data();
    if (!locationId) {
      throw new Error("Missing locationId");
    }
    const updates: { [key: string]: any } = {};
    updates[
      `conversationMessages/${organizationId}/${locationId}/${conversationId}`
    ] = null;
    updates[`conversations/${organizationId}/${locationId}/${conversationId}`] =
      null;

    if (members) {
      for (const member of members) {
        updates[
          `users/${member}/notifications/organizations/${organizationId}/locations/${locationId}/conv`
        ] = null;
      }
    }

    try {
      await database().ref().update(updates);
      await storage()
        .bucket()
        .deleteFiles({
          prefix: `organizations/${organizationId}/locations/${locationId}/conversationMessages/${conversationId}`,
        });
    } catch (error) {
      throw new Error("An error occurred deleting this conversation");
    }
  });
