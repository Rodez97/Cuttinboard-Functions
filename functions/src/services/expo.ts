import Expo, { ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";
import { logger } from "firebase-functions";
import MainVariables from "../config";

export const sendExpoChunkNotifications = async (
  messages: ExpoPushMessage[]
) => {
  const expo = new Expo({
    accessToken: MainVariables.firebaseCuttinboardAccessToken,
  });
  const chunks = expo.chunkPushNotifications(messages);
  const tickets: ExpoPushTicket[] = [];
  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
      // NOTE: If a ticket contains an error code in ticket.details.error, you
      // must handle it appropriately. The error codes are listed in the Expo
      // documentation:
      // https://docs.expo.io/push-notifications/sending-notifications/#individual-errors
    } catch (error) {
      console.error(error);
    }
  }

  // Later, after the Expo push notification service has delivered the
  // notifications to Apple or Google (usually quickly, but allow the the service
  // up to 30 minutes when under load), a "receipt" for each notification is
  // created. The receipts will be available for at least a day; stale receipts
  // are deleted.
  //
  // The ID of each receipt is sent back in the response "ticket" for each
  // notification. In summary, sending a notification produces a ticket, which
  // contains a receipt ID you later use to get the receipt.
  //
  // The receipts may contain error codes to which you must respond. In
  // particular, Apple or Google may block apps that continue to send
  // notifications to devices that have blocked notifications or have uninstalled
  // your app. Expo does not control this policy and sends back the feedback from
  // Apple and Google so you can handle it appropriately.
  const receiptIds = [];
  for (const ticket of tickets) {
    // NOTE: Not all tickets have IDs; for example, tickets for notifications
    // that could not be enqueued will have error information and no receipt ID.
    if (ticket.status === "ok") {
      receiptIds.push(ticket.id);
    } else {
      logger.log(ticket.message);
    }
  }

  const receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
  // Like sending notifications, there are different strategies you could use
  // to retrieve batches of receipts from the Expo service.
  for (const chunk of receiptIdChunks) {
    try {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      console.log(receipts);

      // The receipts specify whether Apple or Google successfully received the
      // notification and information about an error, if one occurred.
      for (const receiptId in receipts) {
        let { status, details } = receipts[receiptId];
        if (status === "ok") {
          continue;
        } else if (status === "error") {
          logger.error(`There was an error sending a notification`, details);
          if ((details as any)?.error) {
            // The error codes are listed in the Expo documentation:
            // https://docs.expo.io/push-notifications/sending-notifications/#individual-errors
            // You must handle the errors appropriately.
            logger.error(`The error code is ${(details as any)?.error}`);
          }
        }
      }
    } catch (error) {
      logger.error(error);
    }
  }
};

export const sendAddedToLocationNotification = async (
  expoToolsTokens: string[],
  locationName: string,
  orgId: string,
  locId: string
) => {
  if (!expoToolsTokens.length) {
    return;
  }
  const messages: ExpoPushMessage[] = [];
  for (const token of expoToolsTokens) {
    if (!Expo.isExpoPushToken(token)) {
      logger.error(`Push token ${token} is not a valid Expo push token`);
      continue;
    }
    messages.push({
      to: token,
      title: `🏢 Added to a new location`,
      sound: "default",
      body: locationName,
      data: {
        organizationId: orgId,
        locationId: locId,
        type: "general",
      },
      channelId: "General",
    });
  }
  try {
    await sendExpoChunkNotifications(messages);
  } catch (error) {
    throw error;
  }
};
