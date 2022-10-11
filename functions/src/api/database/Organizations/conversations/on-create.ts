import { database } from "firebase-admin";
import * as functions from "firebase-functions";

export default functions.firestore
  .document("Organizations/{organizationId}/conversations/{conversationId}")
  .onCreate(async (change, context) => {
    const { organizationId, conversationId } = context.params;
    const { locationId, members } = change.data();

    if (!locationId) {
      throw new Error("Missing locationId");
    }

    if (!members) {
      return;
    }

    const membersObject = (members as string[]).reduce<Record<string, string>>(
      (memRecord, id) => ({ ...memRecord, [id]: id }),
      {}
    );

    try {
      await database()
        .ref(
          `conversations/${organizationId}/${locationId}/${conversationId}/members`
        )
        .set(membersObject);
    } catch (error) {
      throw new Error("An error occurred creating this conversation");
    }
  });
