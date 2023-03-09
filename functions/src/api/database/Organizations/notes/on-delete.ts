import { firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { handleError } from "../../../../services/handleError";

export default functions.firestore
  .document(`/{coll}/{parentId}/notes/{boardId}`)
  .onDelete(async (board) => {
    try {
      // Delete the board's subcollections
      await firestore().recursiveDelete(board.ref);
    } catch (error) {
      handleError(error);
    }
  });
