import { IScheduleDoc, WeekInfo } from "@cuttinboard-solutions/types-helpers";
import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import customParseFormat from "dayjs/plugin/customParseFormat";
import isoWeek from "dayjs/plugin/isoWeek";
import { database, firestore } from "firebase-admin";
import * as functions from "firebase-functions";
// Import dayjs locales
import "dayjs/locale/es";
import "dayjs/locale/en";
import { setISOWeek, setYear } from "date-fns";
import { isEqual } from "lodash";
import {
  INotificationObject,
  sendNotificationToUids,
} from "../../services/oneSignal";
import { MainVariables } from "../../config";
dayjs.extend(isoWeek);
dayjs.extend(advancedFormat);
dayjs.extend(customParseFormat);

function parseWeekId(weekId: string): WeekInfo {
  const [week, year] = weekId.split("-").slice(1).map(Number);
  const start = weekToDate(year, week);
  const end = start.endOf("isoWeek");
  return { year, week, start, end };
}

function weekToDate(year: number, isoWeekNo: number): dayjs.Dayjs {
  if (year < 1970 || year > 2038) {
    throw new Error("Invalid year");
  }

  if (isoWeekNo < 1 || isoWeekNo > 53) {
    throw new Error("Invalid week number");
  }

  const baseDate = new Date();
  const fixedYear = setYear(baseDate, year);
  const fixedWeek = setISOWeek(fixedYear, isoWeekNo);

  return dayjs(fixedWeek).startOf("isoWeek");
}

export default functions.firestore
  .document("/schedule/{scheduleId}")
  .onWrite(async (change) => {
    const afterData = change.after.data() as IScheduleDoc | null | undefined;
    const beforeData = change.before.data() as IScheduleDoc | null | undefined;

    if (!afterData) {
      // ! If the document does not exist (it was deleted), then delete all the shifts for this week.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const { locationId, weekId } = beforeData!;
      await deleteAllShifts(locationId, weekId);
      return;
    }

    const prevPublishData = beforeData?.publishData;
    const publishData = afterData.publishData;

    if (!publishData || isEqual(prevPublishData, publishData)) {
      // ! If the publishData has not changed then return.
      return;
    }

    // * Now we know that the document exists and was either created or updated.

    const { notificationRecipients } = publishData;

    if (!notificationRecipients || !notificationRecipients.length) {
      // If notificationRecipients is not defined then return.
      return;
    }

    const { weekId } = afterData;

    const { start, end } = parseWeekId(weekId);

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

      const englishMessage = `Your schedule has been updated (${start
        .locale("en")
        .format("MMM D")} - ${end.locale("en").format("MMM D")})`;
      const spanishMessage = `Su horario ha sido actualizado (${start
        .locale("es")
        .format("MMM D")} - ${end.locale("es").format("MMM D")})`;

      const notification: INotificationObject = {
        include_external_user_ids: notificationRecipients,
        app_id: MainVariables.oneSignalAppId,
        contents: {
          en: englishMessage,
          es: spanishMessage,
        },
        headings: {
          en: `📅 Schedule updated`,
          es: `📅 Horario actualizado`,
        },
        android_channel_id: MainVariables.scheduleChannelId,
        android_group: `schedule`,
        android_group_summary: true,
        thread_id: `schedule`,
        collapse_id: weekId,
        summary_arg: "1",
        app_url: `cuttinboard://dashboard/stack/myShiftsDashboard`,
      };

      // Send a notification to the notificationRecipients
      await sendNotificationToUids(notification);
    } catch (error: any) {
      functions.logger.error(error);
      throw new functions.https.HttpsError("unknown", error.message);
    }
  });

const deleteAllShifts = async (locationId: string, weekId: string) => {
  const shiftsRef = firestore()
    .collection(`shifts`)
    .where("locationId", "==", locationId)
    .where("weekId", "==", weekId);

  const shiftsSnapshot = await shiftsRef.get();

  if (shiftsSnapshot.empty) {
    return;
  }

  const bulkWriter = firestore().bulkWriter();

  shiftsSnapshot.forEach((doc) => {
    bulkWriter.delete(doc.ref);
  });

  await bulkWriter.close();
};
