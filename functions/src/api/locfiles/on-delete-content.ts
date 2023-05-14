import { ICuttinboard_File } from "@cuttinboard-solutions/types-helpers";
import { storage } from "firebase-admin";
import * as functions from "firebase-functions";

export default functions.firestore
  .document(`/Locations/{locationId}/files/{drawerId}/content/{fileId}`)
  .onDelete(async (deletedFile) => {
    const { storagePath } = deletedFile.data() as ICuttinboard_File;

    try {
      // Delete the file from the storage
      await storage().bucket().file(storagePath).delete();
    } catch (error: any) {
      functions.logger.error(error);
    }
  });