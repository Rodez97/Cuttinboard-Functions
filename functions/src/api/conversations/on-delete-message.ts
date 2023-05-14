import { IMessage } from "@cuttinboard-solutions/types-helpers";
import { storage } from "firebase-admin";
import { parseStoragePathFromUrl } from "../../services/helpers";
import * as functions from "firebase-functions";

export default functions.firestore
  .document("/conversations/{chatId}/messages/{messageId}")
  .onDelete(async (data) => {
    if (!data?.exists) {
      return;
    }

    const message = data.data() as IMessage;

    if (!message.image) return;

    try {
      // Parse the storage path from the URL
      const { path } = parseStoragePathFromUrl(message.image);

      // Delete the file from the storage
      await storage().bucket().file(path).delete();
    } catch (error: any) {
      functions.logger.error(error);
      throw new functions.https.HttpsError("unknown", error.message);
    }
  });
