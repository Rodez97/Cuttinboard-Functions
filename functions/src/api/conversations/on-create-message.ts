import { IMessage } from "@rodez97/types-helpers";
import { database, firestore } from "firebase-admin";
import { conversationConverter } from "../../models/converters/directMessageConverter";
import {
  INotificationObject,
  sendNotificationToUids,
} from "../../services/oneSignal";
import * as functions from "firebase-functions";

export default functions.firestore
  .document("/conversations/{chatId}/messages/{messageId}")
  .onCreate(async (data, context) => {
    const { params } = context;

    if (!data?.exists) {
      // ! If the message does not exist then do nothing
      return;
    }

    const { chatId, messageId } = params;

    const { systemType, ...newMessage } = data.data() as IMessage;

    if (systemType) {
      // ! If the message is a system message then do nothing
      return;
    }

    const conversationDocument = await firestore()
      .doc(`conversations/${chatId}`)
      .withConverter(conversationConverter)
      .get();

    const conversationDocumentData = conversationDocument.data();

    if (!conversationDocumentData) {
      // ! If the conversation does not exist then do nothing
      return;
    }

    const {
      user: { _id: senderId, name: senderName, avatar: senderAvatar },
      text,
      image,
    } = newMessage;

    const allMembers = conversationDocumentData.members
      ? Object.keys(conversationDocumentData.members).filter(
          (member) => member !== senderId
        )
      : [];

    const unmutedMembers = conversationDocumentData.members
      ? Object.entries(conversationDocumentData.members)
          .filter(([member, { muted }]) => member !== senderId && !muted)
          .map(([member]) => member)
      : [];

    if (allMembers.length === 0) {
      // ! If there are no members to send the notification to then do nothing
      return;
    }

    // Initialize the notification object for the realtime database
    const realtimeNotifications: { [key: string]: object } = {};

    for (const member of allMembers) {
      // Increment the unread messages count for each member
      realtimeNotifications[`users/${member}/notifications/conv/${chatId}`] =
        database.ServerValue.increment(1);
    }

    try {
      await database().ref().update(realtimeNotifications);

      // Update recent message timestamp
      await firestore()
        .collection("conversations")
        .doc(chatId)
        .withConverter(conversationConverter)
        .update({
          recentMessage: firestore.Timestamp.now().toMillis(),
        });

      // Send the notification to the members that are offline
      if (unmutedMembers.length > 0) {
        const notification: INotificationObject = {
          include_external_user_ids: unmutedMembers,
          app_id: process.env.ONE_SIGNAL_APP_ID,
          contents: {
            en: text ? text : image ? "📷 New image" : "New message",
          },
          headings: {
            en: `💬 ${senderName} (${conversationDocumentData.name})`,
          },
          android_channel_id: process.env.MESSAGE_BOARDS_CHANNEL_ID,
          thread_id: chatId,
          android_group: chatId,
          summary_arg: conversationDocumentData.name,
          app_url: `cuttinboard://dashboard/stack/conversations/${chatId}`,
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
    } catch (error: any) {
      functions.logger.error(error);
      throw new functions.https.HttpsError("unknown", error.message);
    }
  });
