import { storage } from "firebase-admin";
import * as functions from "firebase-functions";

export default functions.firestore
  .document(
    `/Organizations/{organizationId}/storage/{drawerId}/content/{fileId}`
  )
  .onDelete(async (deletedFile) => {
    const fileData = deletedFile.data();
    const { storagePath } = fileData;

    if (!storagePath) {
      return;
    }

    try {
      await storage().bucket().file(storagePath).delete();
    } catch (error) {
      throw new Error("An error occurred while deleting the file");
    }
  });
