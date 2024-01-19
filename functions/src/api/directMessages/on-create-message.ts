import { IMessage } from "@rodez97/types-helpers";
import { database, firestore } from "firebase-admin";
import { directMessageConverter } from "../../models/converters/directMessageConverter";
import {
  INotificationObject,
  sendNotificationToUids,
} from "../../services/oneSignal";
import * as functions from "firebase-functions";

export default functions.firestore
  .document("/directMessages/{chatId}/messages/{messageId}")
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

    const {
      user: { _id: senderId, name: senderName, avatar: senderAvatar },
      text,
      image,
    } = newMessage;

    // * Note: The chatId is composed of the senderId and the receiverId separated by a (&) symbol
    const recipient = chatId.replace(senderId, "").replace("&", "");

    if (!recipient) {
      // ! If the recipient is not found then do nothing (this should never happen)
      throw new functions.https.HttpsError(
        "not-found",
        "The recipient was not found"
      );
    }

    try {
      // Check if the recipient is muted
      const dmDocument = await firestore()
        .doc(`directMessages/${chatId}`)
        .withConverter(directMessageConverter)
        .get();

      const dmData = dmDocument.data();

      if (!dmData) {
        // ! If the dmInfo does not exist then do nothing
        return;
      }

      const { muted } = dmData;

      const isMuted = muted?.includes(recipient);

      // Update recent message timestamp
      await firestore()
        .collection("directMessages")
        .doc(chatId)
        .withConverter(directMessageConverter)
        .update({
          recentMessage: firestore.Timestamp.now().toMillis(),
        });

      await database()
        .ref()
        .update({
          [`users/${recipient}/notifications/dm/${chatId}`]:
            database.ServerValue.increment(1),
        });

      if (isMuted) {
        // ! If the recipient is muted or online then do nothing
        return;
      }

      const notification: INotificationObject = {
        include_external_user_ids: [recipient],
        app_id: process.env.ONE_SIGNAL_APP_ID,
        contents: {
          en: text ? text : image ? "📷 New image" : "New message",
        },
        headings: {
          en: `💬 New message from ${senderName}`,
          es: `💬 Nuevo mensaje de ${senderName}`,
        },
        android_channel_id: process.env.DIRECT_MESSAGES_CHANNEL_ID,
        android_group: chatId,
        thread_id: chatId,
        summary_arg: senderName,
        app_url: `cuttinboard://dashboard/stack/dm/${chatId}`,
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
    } catch (error: any) {
      functions.logger.error(error);
      throw new functions.https.HttpsError("unknown", error.message);
    }
  });
