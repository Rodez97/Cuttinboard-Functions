import { database } from "firebase-admin";
import * as functions from "firebase-functions";
import { isEqual } from "lodash";
import { createAccessObject } from "../../../../services/createAccessObject";

/**
 * Comprobar si hay cambios en los miembros de la conversación para eliminarlos o añadirlos a Realtime Database.
 */
export default functions.firestore
  .document("Organizations/{organizationId}/conversations/{conversationId}")
  .onUpdate(async (change, context) => {
    const { organizationId, conversationId } = context.params;
    const { accessTags: bAccessTags } = change.before.data();
    const { locationId, accessTags, privacyLevel } = change.after.data();

    if (isEqual(bAccessTags, accessTags)) {
      return;
    }

    const accessTagsObject = createAccessObject(accessTags, privacyLevel);

    try {
      await database()
        .ref(
          `conversations/${organizationId}/${locationId}/${conversationId}/accessTags`
        )
        .set(accessTagsObject);
    } catch (error) {
      throw new Error("An error occurred updating this conversation");
    }
  });
