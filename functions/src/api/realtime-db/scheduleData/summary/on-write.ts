import { IScheduleDoc } from "@cuttinboard-solutions/types-helpers";
import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import customParseFormat from "dayjs/plugin/customParseFormat";
import isoWeek from "dayjs/plugin/isoWeek";
import { database } from "firebase-admin";
import * as functions from "firebase-functions";
import { MainVariables } from "../../../../config";
import {
  INotificationObject,
  sendNotificationToUids,
} from "../../../../services/oneSignal";
dayjs.extend(isoWeek);
dayjs.extend(advancedFormat);
dayjs.extend(customParseFormat);

export default functions.database
  .ref("/schedule/{weekId}/{locationId}")
  .onWrite(async (change, context) => {
    const afterData = change.after.val() as IScheduleDoc | null;
    const beforeData = change.before.val() as IScheduleDoc | null;
    if (!afterData) {
      // ! If the document does not exist then return (it was deleted)
      return;
    }

    // * Now we know that the document exists and was either created or updated.

    const { weekId } = context.params;

    // Get the scheduleDoc data
    const { updatedAt, publishData } = afterData; // ? (!) Because we know that the document exists.

    const beforeUpdatedAt = beforeData?.updatedAt;

    if (beforeUpdatedAt === updatedAt) {
      // If the updatedAt value is the same as before then return.
      return;
    }

    if (!publishData) {
      // If publishData is not defined then return.
      return;
    }

    const { notificationRecipients } = publishData;

    if (!notificationRecipients || !notificationRecipients.length) {
      // If notificationRecipients is not defined then return.
      return;
    }

    // Initialize the realtime updates object
    const realtimeNotifications: { [key: string]: object } = {};

    // Increment the notification count for each user in the notificationRecipients array in this scheduleDoc.
    for (const targetUser of notificationRecipients) {
      realtimeNotifications[`users/${targetUser}/notifications/sch`] =
        database.ServerValue.increment(1);
    }

    try {
      // Commit the realtime updates
      await database().ref().update(realtimeNotifications);

      const notification: INotificationObject = {
        include_external_user_ids: notificationRecipients,
        app_id: MainVariables.oneSignalAppId,
        contents: {
          en: `Your schedule has been updated.`,
          es: `Su horario ha sido actualizado.`,
        },
        headings: {
          en: `📅 Schedule updated`,
          es: `📅 Horario actualizado`,
        },
        android_channel_id: "fc5fd854-cd9f-4fe3-9d2d-cf873803f2f4",
        android_group: `scheduleUpdated`,
        android_group_summary: true,
        thread_id: `scheduleUpdated`,
        collapse_id: weekId,
        summary_arg: "1",
      };

      // Send a notification to the notificationRecipients
      await sendNotificationToUids(notification);
    } catch (error: any) {
      functions.logger.error(error);
      throw new functions.https.HttpsError("unknown", error.message);
    }
  });
