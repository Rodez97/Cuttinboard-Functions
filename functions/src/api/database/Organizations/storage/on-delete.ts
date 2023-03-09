import { firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { handleError } from "../../../../services/handleError";

export default functions.firestore
  .document(`/{coll}/{parentId}/files/{drawerId}`)
  .onDelete(async (deletedDrawer) => {
    try {
      // Delete the drawer's subcollections
      await firestore().recursiveDelete(deletedDrawer.ref);
    } catch (error) {
      handleError(error);
    }
  });
