import { database } from "firebase-admin";
import * as functions from "firebase-functions";
import { difference } from "lodash";
import MainVariables from "../../../config";
import { sendNotificationToUids } from "../../../services/oneSignal";

export default functions.database
  .ref(
    "/conversationMessages/{organizationId}/{locationId}/{chatId}/{messageId}"
  )
  .onCreate(async (data, context) => {
    const { organizationId, chatId, locationId } = context.params;

    const newMessage = data.val();

    if (newMessage?.type === "system") {
      return;
    }

    const membersSnap = await database()
      .ref(`conversations/${organizationId}/${locationId}/${chatId}/members`)
      .get();

    if (!membersSnap.exists()) {
      return;
    }

    const members = Object.keys(membersSnap.val());

    const {
      sender: { id: senderId, name: senderName },
      message,
      notificationData: { locationName },
    } = newMessage;

    // Objeto con el que componer las actualizaciones a la RDB
    const realtimeNotifications: { [key: string]: any } = {};

    for (const mem of difference(members, [senderId])) {
      realtimeNotifications[
        `users/${mem}/notifications/${organizationId}/locations/${locationId}/conv/${chatId}`
      ] = database.ServerValue.increment(1);
    }

    try {
      await database().ref().update(realtimeNotifications);
      await sendNotificationToUids({
        include_external_user_ids: difference(members, [senderId]),
        app_id: MainVariables.oneSignalAppId,
        contents: {
          en: message,
        },
        headings: {
          en: `💬 ${senderName} (${locationName})`,
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
