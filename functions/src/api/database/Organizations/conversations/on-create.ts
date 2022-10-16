import { database } from "firebase-admin";
import * as functions from "firebase-functions";
import { createAccessObject } from "../../../../services/createAccessObject";

export default functions.firestore
  .document("Organizations/{organizationId}/conversations/{conversationId}")
  .onCreate(async (change, context) => {
    const { organizationId, conversationId } = context.params;
    const { locationId, accessTags, privacyLevel } = change.data();

    if (!locationId) {
      throw new Error("Missing locationId");
    }

    if (!accessTags) {
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
      throw new Error("An error occurred creating this conversation");
    }
  });
