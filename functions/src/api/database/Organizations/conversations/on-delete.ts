import { IConversation } from "@cuttinboard-solutions/types-helpers";
import { database, storage } from "firebase-admin";
import * as functions from "firebase-functions";
import { handleError } from "../../../../services/handleError";

/**
 * Deletes the conversation data from the Realtime Database when a conversation is deleted from Firestore.
 * - Clears the employee's memberships in the conversation
 * - Delete the attachments from the storage bucket
 * - Delete the conversation messages from the Realtime Database
 * - Delete the conversation from the Realtime Database
 * - Update the users to remove the conversations fi the user is admin, muted or member
 */
export default functions.firestore
  .document("Locations/{locationId}/conversations/{conversationId}")
  .onDelete(async (change, context) => {
    const { locationId, conversationId } = context.params;

    const { organizationId, members } = change.data() as IConversation;

    const updates: { [key: string]: null } = {
      [`conversationMessages/${organizationId}/${locationId}/${conversationId}`]:
        null,
      [`conversations/${organizationId}/${locationId}/${conversationId}`]: null,
    };

    // Clear the employee's conversations badges
    members?.forEach((member) => {
      updates[
        `users/${member}/notifications/organizations/${organizationId}/locations/${locationId}/conv/${conversationId}`
      ] = null;
    });

    try {
      await database().ref().update(updates);

      await storage()
        .bucket()
        .deleteFiles({
          prefix: `organizations/${organizationId}/locations/${locationId}/conversationMessages/${conversationId}`,
        });
    } catch (error) {
      handleError(error);
    }
  });
