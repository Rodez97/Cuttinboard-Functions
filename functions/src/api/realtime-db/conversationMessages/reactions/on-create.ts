import * as functions from "firebase-functions";
import MainVariables from "../../../../config";
import { sendNotificationToUids } from "../../../../services/oneSignal";

export default functions.database
  .ref(
    "/conversationMessages/{organizationId}/{locationId}/{chatId}/{messageId}/reactions/{uid}"
  )
  .onCreate(async (data, context) => {
    const { uid } = context.params;

    const { emoji, name } = data.val();

    if (!emoji || !name) {
      return;
    }

    try {
      await sendNotificationToUids({
        include_external_user_ids: [uid],
        app_id: MainVariables.oneSignalAppId,
        contents: {
          en: `${name} has reacted to your message with ${emoji}`,
          es: `${name} ha reaccionado a tu mensaje con ${emoji}`,
        },
        headings: {
          en: `💬 Message reaction`,
          es: `💬 Han reaccionado a tu mensaje`,
        },
      });
    } catch (error) {
      throw new functions.https.HttpsError(
        "unknown",
        "there was an error when processing notifications",
        error
      );
    }
  });
