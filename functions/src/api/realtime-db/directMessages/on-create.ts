import { database } from "firebase-admin";
import * as functions from "firebase-functions";
import MainVariables from "../../../config";
import { sendNotificationToUids } from "../../../services/oneSignal";

export default functions.database
  .ref("/directMessages/{chatId}/{messageId}")
  .onCreate(async (data, context) => {
    const { chatId } = context.params;

    const newMessage = data.val();

    if (newMessage?.type === "system") {
      return;
    }

    const {
      sender: { id: senderId, name: senderName },
      message,
    } = newMessage;

    const targetMember = String(chatId).replace(senderId, "").replace("&", "");

    if (!targetMember) {
      return;
    }

    const realtimeUpdates: { [key: string]: any } = {};

    realtimeUpdates[`users/${targetMember}/notifications/dm/${chatId}`] =
      database.ServerValue.increment(1);

    try {
      await database().ref().update(realtimeUpdates);
      await sendNotificationToUids({
        include_external_user_ids: [targetMember],
        app_id: MainVariables.oneSignalAppId,
        contents: {
          en: message,
        },
        headings: {
          en: `💬 New message from ${senderName}`,
          es: `💬 Nuevo mensaje de ${senderName}`,
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
