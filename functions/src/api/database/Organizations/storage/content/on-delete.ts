import { ICuttinboard_File } from "@cuttinboard-solutions/types-helpers";
import { storage } from "firebase-admin";
import * as functions from "firebase-functions";
import { handleError } from "../../../../../services/handleError";

export default functions.firestore
  .document(`/{coll}/{parentId}/files/{drawerId}/content/{fileId}`)
  .onDelete(async (deletedFile) => {
    const { storagePath } = deletedFile.data() as ICuttinboard_File;

    try {
      // Delete the file from the storage
      await storage().bucket().file(storagePath).delete();
    } catch (error) {
      handleError(error);
    }
  });
