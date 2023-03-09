import { storage } from "firebase-admin";
import * as functions from "firebase-functions";

export async function deleteFiles(prefix: string) {
  try {
    // Delete the location files from the storage
    await storage().bucket().deleteFiles({
      prefix,
    });
  } catch (error) {
    functions.logger.error("Error deleting files: ", error);
  }
}
