import { IConversation } from "@cuttinboard-solutions/types-helpers";
import { database } from "firebase-admin";
import * as functions from "firebase-functions";
import { handleError } from "../../../../services/handleError";
import { stringArrayToMap } from "../../../../services/stringArrayToMap";

export default functions.firestore
  .document("Locations/{locationId}/conversations/{conversationId}")
  .onUpdate(async (change, context) => {
    const { locationId, conversationId } = context.params;

    const { organizationId, members, muted, position, privacyLevel, hosts } =
      change.after.data() as IConversation;

    try {
      // Set the access object in Realtime Database
      await database()
        .ref(
          `conversations/${organizationId}/${locationId}/${conversationId}/access`
        )
        .update({
          // Convert the members and muted arrays into maps, where the keys are the elements of the array and the values are true
          members: members ? stringArrayToMap(members) : null,
          muted: muted ? stringArrayToMap(muted) : null,
          hosts: hosts ? stringArrayToMap(hosts) : null,
          position: position ?? null,
          privacyLevel,
        });
    } catch (error) {
      // If there is an error then throw an error
      handleError(error);
    }
  });
