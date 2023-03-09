import { IMessage } from "@cuttinboard-solutions/types-helpers";
import { database } from "firebase-admin";
import * as functions from "firebase-functions";
import { difference } from "lodash";
import { MainVariables } from "../../../config";
import { ConversationAccess } from "../../../models/ConversationAccess";
import { handleError } from "../../../services/handleError";
import {
  INotificationObject,
  sendNotificationToUids,
} from "../../../services/oneSignal";

export default functions.database
  .ref(
    "/conversationMessages/{organizationId}/{locationId}/{chatId}/{messageId}"
  )
  .onCreate(async (data, context) => {
    const { organizationId, chatId, locationId, messageId } = context.params;

    const { systemType, ...newMessage } = data.val() as IMessage;

    if (systemType) {
      // ! If the message is a system message then do nothing
      return;
    }

    const conversationAccess = await database()
      .ref(`conversations/${organizationId}/${locationId}/${chatId}/access`)
      .get();

    if (!conversationAccess.exists()) {
      // ! If the conversation does not exist then do nothing
      return;
    }

    const {
      sender: { id: senderId, name: senderName, avatar: senderAvatar },
      text,
      locationName,
      image,
    } = newMessage;

    // Get the conversation members ids that are not muted, and remove the sender id from the list
    const conversationAccessData: ConversationAccess = conversationAccess.val();
    const membersOffline = conversationAccessData.members
      ? Object.entries(conversationAccessData.members)
          .filter(([member, online]) => member !== senderId && !online)
          .map(([member]) => member)
      : [];
    const muted = conversationAccessData.muted
      ? Object.keys(conversationAccessData.muted).filter(
          (member) => member !== senderId
        )
      : [];

    const pushRecipients = difference(membersOffline, muted);

    if (membersOffline.length === 0) {
      // ! If there are no members to send the notification to then do nothing
      return;
    }

    // Initialize the notification object for the realtime database
    const realtimeNotifications: { [key: string]: object } = {};

    for (const member of membersOffline) {
      // Increment the unread messages count for each member
      realtimeNotifications[
        `users/${member}/notifications/organizations/${organizationId}/locations/${locationId}/conv/${chatId}`
      ] = database.ServerValue.increment(1);
    }

    try {
      await database().ref().update(realtimeNotifications);
      if (pushRecipients.length > 0) {
        const notification: INotificationObject = {
          include_external_user_ids: pushRecipients,
          app_id: MainVariables.oneSignalAppId,
          contents: {
            en: text ? text : image ? "📷 New image" : "New message",
          },
          headings: {
            en: `💬 ${senderName} (${locationName})`,
          },
          android_channel_id: "e987158c-2352-47c5-b9fa-635a1e948d97",
          android_group: "conversation",
          android_group_message: {
            en: "{{notification_count}} new messages",
            es: "{{notification_count}} nuevos mensajes",
          },
          android_group_summary: true,
          thread_id: "conversation",
          collapse_id: chatId,
          summary_arg: "1",
        };

        if (senderAvatar) {
          notification.large_icon = senderAvatar;
        }

        if (image) {
          notification.big_picture = image;
          notification.ios_attachments = {
            [messageId]: image,
          };
        }

        await sendNotificationToUids(notification);
      }
    } catch (error) {
      handleError(error);
    }
  });
