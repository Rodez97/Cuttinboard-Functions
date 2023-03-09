import { database } from "firebase-admin";
import * as functions from "firebase-functions";
import { handleError } from "../../../services/handleError";
import { stringArrayToMap } from "../../../services/stringArrayToMap";

export default functions.firestore
  .document("DirectMessages/{chatId}")
  .onCreate(async (data, context) => {
    // Get the chat ID from the context params.
    const { chatId } = context.params;

    // Get the list of members in the chat from the deleted document data.
    const membersList: string[] | undefined = data.get("membersList");

    try {
      // Set the access object in Realtime Database
      await database()
        .ref(`dmInfo/${chatId}`)
        .update({
          membersList: membersList ? stringArrayToMap(membersList) : null,
          muted: membersList ? stringArrayToMap(membersList) : null,
        });
    } catch (error) {
      // If there is an error then throw an error
      handleError(error);
    }
  });
