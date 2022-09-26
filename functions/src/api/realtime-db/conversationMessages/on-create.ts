import { database } from "firebase-admin";
import * as functions from "firebase-functions";
import { difference } from "lodash";
import MainVariables from "../../../config";
import { sendNotificationToUids } from "../../../services/oneSignal";

// export default functions.database
//   .ref(
//     "/conversationMessages/{organizationId}/{locationId}/{chatId}/{messageId}"
//   )
//   .onCreate(async (data, context) => {
//     const { organizationId, chatId, locationId, messageId } = context.params;

//     const newMessage = data.val();

//     if (newMessage?.type === "system") {
//       return;
//     }

//     const membersSnap = await database()
//       .ref(`conversations/${organizationId}/${locationId}/${chatId}/members`)
//       .get();

//     if (!membersSnap.exists()) {
//       return;
//     }

//     const members = Object.keys(membersSnap.val());

//     const {
//       sender: { id: senderId, name: senderName },
//       message,
//       notificationData: { tokens, locationName },
//     } = newMessage;

//     // Objeto con el que componer las actualizaciones a la RDB
//     const realtimeNotifications: { [key: string]: any } = {};
//     const notificationId = `conv_${chatId}`;

//     for (const mem of members) {
//       if (mem === senderId) {
//         continue;
//       }
//       realtimeNotifications[
//         `users/${mem}/notifications/${organizationId}/locations/${locationId}/conv/${chatId}`
//       ] = database.ServerValue.increment(1);
//     }

//     const messages: ExpoPushMessage[] = [];
//     if (tokens && Array.isArray(tokens)) {
//       for (const token of tokens) {
//         if (!Expo.isExpoPushToken(token)) {
//           functions.logger.error(
//             `Push token ${token} is not a valid Expo push token`
//           );
//           continue;
//         }
//         messages.push({
//           to: token,
//           title: `💬 ${senderName} (${locationName})`,
//           sound: "default",
//           body: message,
//           data: {
//             organizationId,
//             id: notificationId,
//             type: "conversations",
//           },
//           channelId: "General",
//         });
//       }
//     }

//     realtimeNotifications[
//       `conversationMessages/${organizationId}/${locationId}/${chatId}/${messageId}/notificationData`
//     ] = null;

//     try {
//       await database().ref().update(realtimeNotifications);
//       if (messages.length) {
//         await sendExpoChunkNotifications(messages);
//       }
//     } catch (error) {
//       throw new functions.https.HttpsError(
//         "unknown",
//         "there was an error when processing notifications",
//         error
//       );
//     }
//   });

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
