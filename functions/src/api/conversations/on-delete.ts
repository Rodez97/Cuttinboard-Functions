import { IConversation } from "@rodez97/types-helpers";
import { database, firestore, storage } from "firebase-admin";
import * as functions from "firebase-functions";

export default functions.firestore
  .document("/conversations/{conversationId}")
  .onDelete(async (data, context) => {
    const { params } = context;

    if (!data?.exists) {
      // ! If the message does not exist then do nothing
      return;
    }

    const { conversationId } = params;

    const { members } = data.data() as IConversation;

    const updates: { [key: string]: null } = {};

    // Clear the employee's conversations badges
    for (const member in members) {
      updates[`users/${member}/notifications/conv/${conversationId}`] = null;
    }

    try {
      await database().ref().update(updates);

      await firestore().recursiveDelete(data.ref);

      await storage()
        .bucket()
        .deleteFiles({
          prefix: `conversations/${conversationId}`,
        });
    } catch (error: any) {
      functions.logger.error(error);
      throw new functions.https.HttpsError("unknown", error.message);
    }
  });
