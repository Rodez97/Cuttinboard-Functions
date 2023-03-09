import { database } from "firebase-admin";
import * as functions from "firebase-functions";
import { handleError } from "../../../../services/handleError";
import { stringArrayToMap } from "../../../../services/stringArrayToMap";
import { ConversationAccess } from "../../../../models/ConversationAccess";
import { IConversation } from "@cuttinboard-solutions/types-helpers";

export default functions.firestore
  .document("Locations/{locationId}/conversations/{conversationId}")
  .onCreate(async (change, context) => {
    // Extract the location and conversation IDs from the context object
    const { locationId, conversationId } = context.params;

    // Retrieve the data of the newly created conversation document
    const { organizationId, members, muted, position, privacyLevel, hosts } =
      change.data() as IConversation;

    try {
      const AccessObject: ConversationAccess = {
        members: members ? stringArrayToMap(members) : null,
        muted: muted ? stringArrayToMap(muted) : null,
        hosts: hosts ? stringArrayToMap(hosts) : null,
        position: position ?? null,
        privacyLevel,
      };
      // Set the values of members, muted, position, and privacyLevel in the Realtime Database
      await database()
        .ref(
          `conversations/${organizationId}/${locationId}/${conversationId}/access`
        )
        .update(AccessObject);
    } catch (error) {
      // Handle any errors that occurred while setting the data in the Realtime Database
      handleError(error);
    }
  });
