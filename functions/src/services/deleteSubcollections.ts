import { firestore } from "firebase-admin";
import { DocumentReference } from "firebase-admin/firestore";
import * as functions from "firebase-functions";

export async function deleteSubcollections(ref: DocumentReference) {
  try {
    // Delete the location document and all its subcollections
    await firestore().recursiveDelete(ref);
  } catch (error) {
    functions.logger.error("Error deleting subcollections: ", error);
  }
}
