import { IDirectMessage } from "@rodez97/types-helpers";
import { database, firestore, storage } from "firebase-admin";
import * as functions from "firebase-functions";

export default functions.firestore
  .document("directMessages/{chatId}")
  .onDelete(async (data, context) => {
    const { params } = context;

    if (!data?.exists) {
      return;
    }

    const { chatId } = params;

    const { members } = data.data() as IDirectMessage;

    const updates: { [key: string]: null } = {};

    // Delete the notifications for this chat from the realtime database for each member.
    for (const member in members) {
      updates[`users/${member}/notifications/dm/${chatId}`] = null;
    }

    try {
      await database().ref().update(updates);

      await firestore().recursiveDelete(data.ref);

      await storage()
        .bucket()
        .deleteFiles({
          prefix: `directMessages/${chatId}`,
        });
    } catch (error: any) {
      functions.logger.error(error);
      throw new functions.https.HttpsError("unknown", error.message);
    }
  });
