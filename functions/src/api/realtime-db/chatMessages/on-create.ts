import Expo, { ExpoPushMessage } from "expo-server-sdk";
import { database } from "firebase-admin";
import * as functions from "firebase-functions";
import { sendExpoChunkNotifications } from "../../../services/expo";

export default functions.database
  .ref("/chatMessages/{organizationId}/{chatId}/{messageId}")
  .onCreate(async (data, context) => {
    const { organizationId, chatId, messageId } = context.params;

    const newMessage = data.val();

    if (newMessage?.type === "system") {
      return;
    }

    const {
      sender: { id: senderId, name: senderName },
      message,
      notificationData: { tokens, locationName },
    } = newMessage;

    const members = String(chatId).split("&");

    const targetMember: string | undefined = members?.find(
      (m: string) => m !== senderId
    );

    if (!targetMember) {
      return;
    }

    const realtimeUpdates: { [key: string]: any } = {};

    realtimeUpdates[
      `users/${targetMember}/notifications/${organizationId}/dm/${chatId}`
    ] = database.ServerValue.increment(1);

    realtimeUpdates[
      `chatMessages/${organizationId}/${chatId}/${messageId}/notificationData`
    ] = null;

    const messages: ExpoPushMessage[] = [];

    if (tokens && Array.isArray(tokens)) {
      for (const token of tokens) {
        if (!Expo.isExpoPushToken(token)) {
          functions.logger.error(
            `Push token ${token} is not a valid Expo push token`
          );
          continue;
        }
        messages.push({
          to: token,
          title: `💬 New message from ${senderName} (${locationName})`,
          sound: "default",
          body: message,
          data: {
            organizationId,
            id: `dm_${chatId}`,
            type: "chats",
          },
          channelId: "General",
        });
      }
    }

    try {
      await database().ref().update(realtimeUpdates);
      if (messages.length) {
        await sendExpoChunkNotifications(messages);
      }
    } catch (error) {
      throw new functions.https.HttpsError(
        "unknown",
        "there was an error when processing notifications",
        error
      );
    }
  });
