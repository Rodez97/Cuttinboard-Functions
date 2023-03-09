import { database, storage } from "firebase-admin";
import * as functions from "firebase-functions";
import { handleError } from "../../../services/handleError";

export default functions.firestore
  .document("DirectMessages/{chatId}")
  .onDelete(async (change, context) => {
    // Get the chat ID from the context params.
    const { chatId } = context.params;

    // Get the list of members in the chat from the deleted document data.
    const { membersList } = change.data();

    // Delete the attachments for this chat from storage.
    await deleteAttachments(chatId);

    // Execute the update operations on the realtime database.
    await updateDatabase(chatId, membersList);
  });

// Deletes the attachments for a chat from storage.
async function deleteAttachments(chatId: string) {
  try {
    await storage()
      .bucket()
      .deleteFiles({
        prefix: `directMessages/${chatId}`,
      });
  } catch (error) {
    handleError(error);
  }
}

// Updates the realtime database with the specified operations.
async function updateDatabase(chatId: string, membersList: string[]) {
  // Initialize an object to store the update operations.
  const updates: { [key: string]: null } = {};

  // Delete the messages for this chat from the realtime database.
  updates[`directMessages/${chatId}`] = null;

  updates[`dmInfo/${chatId}`] = null;

  // Delete the notifications for this chat from the realtime database for each member.
  for (const member of membersList) {
    updates[`users/${member}/notifications/dm/${chatId}`] = null;
  }

  try {
    await database().ref().update(updates);
  } catch (error) {
    handleError(error);
  }
}
