import { IMessage } from "@cuttinboard-solutions/types-helpers";
import { database } from "firebase-admin";
import * as functions from "firebase-functions";
import { MainVariables } from "../../../config";
import { handleError } from "../../../services/handleError";
import {
  INotificationObject,
  sendNotificationToUids,
} from "../../../services/oneSignal";

export default functions.database
  .ref("/directMessages/{chatId}/{messageId}")
  .onCreate(async (data, context) => {
    const { chatId, messageId } = context.params;

    const { systemType, ...newMessage } = data.val() as IMessage;

    if (systemType) {
      // ! If the message is a system message then do nothing
      return;
    }

    const {
      sender: { id: senderId, name: senderName, avatar: senderAvatar },
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
      const dmInfo = await database().ref(`dmInfo/${chatId}`).get();

      if (!dmInfo.exists()) {
        // ! If the dmInfo does not exist then do nothing
        return;
      }

      const { muted, membersList } = dmInfo.val();

      const isMuted = muted?.[recipient] === true;
      const isOnline = membersList?.[recipient] === true;

      if (!isOnline) {
        await database()
          .ref()
          .update({
            [`users/${recipient}/notifications/dm/${chatId}`]:
              database.ServerValue.increment(1),
          });
      }

      if (isMuted || isOnline) {
        // ! If the recipient is muted or online then do nothing
        return;
      }

      const notification: INotificationObject = {
        include_external_user_ids: [recipient],
        app_id: MainVariables.oneSignalAppId,
        contents: {
          en: text ? text : image ? "📷 New image" : "New message",
        },
        headings: {
          en: `💬 New message from ${senderName}`,
          es: `💬 Nuevo mensaje de ${senderName}`,
        },
        android_channel_id: "e987158c-2352-47c5-b9fa-635a1e948d97",
        android_group: "directMessages",
        android_group_message: {
          en: "{{notification_count}} new messages",
          es: "{{notification_count}} nuevos mensajes",
        },
        android_group_summary: true,
        thread_id: "directMessages",
        collapse_id: chatId,
        summary_arg: "1",
        app_url: `cuttinboard://dashboard/dm/${chatId}`,
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
    } catch (error) {
      handleError(error);
    }
  });
