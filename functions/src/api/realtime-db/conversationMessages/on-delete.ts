import { IMessage } from "@cuttinboard-solutions/types-helpers";
import { storage } from "firebase-admin";
import * as functions from "firebase-functions";
import { handleError } from "../../../services/handleError";
import { parseStoragePathFromUrl } from "../../../services/helpers";

export default functions.database
  .ref(
    "/conversationMessages/{organizationId}/{locationId}/{chatId}/{messageId}"
  )
  .onDelete(async (snapshot) => {
    const message: IMessage | null = snapshot.val();

    if (!message || !message.image) return;

    try {
      // Parse the storage path from the URL
      const { path } = parseStoragePathFromUrl(message.image);

      // Delete the file from the storage
      await storage().bucket().file(path).delete();
    } catch (error) {
      handleError(error);
    }
  });
