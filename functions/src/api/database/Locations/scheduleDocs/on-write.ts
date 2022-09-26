import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import customParseFormat from "dayjs/plugin/customParseFormat";
import isoWeek from "dayjs/plugin/isoWeek";
import { database, FirebaseError, firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { uniq } from "lodash";
import MainVariables from "../../../../config";
import { sendNotificationToUids } from "../../../../services/oneSignal";
dayjs.extend(isoWeek);
dayjs.extend(advancedFormat);
dayjs.extend(customParseFormat);

const WEEKFORMAT = "[W]-W-YYYY";

export default functions.firestore
  .document(`/Locations/{locationId}/scheduleDocs/{scheduleDocId}`)
  .onWrite(async (change, context) => {
    if (change.before.exists && !change.after.exists) {
      return;
    }

    const afterData = change.after.data();

    if (!afterData) {
      return;
    }

    const { isPublished } = afterData;

    let beforePublished = false;

    const beforeData = change.before.data();

    if (beforeData) {
      beforePublished = Boolean(beforeData.isPublished);
    }

    if (!isPublished || beforePublished === isPublished) {
      return;
    }

    const { locationId, scheduleDocId } = context.params;

    const currentWeek = dayjs().format(WEEKFORMAT);
    const nextWeek = dayjs().add(1, "week").format(WEEKFORMAT);

    if (scheduleDocId !== currentWeek && scheduleDocId !== nextWeek) {
      return;
    }

    const getShifts = await firestore()
      .collection("Locations")
      .doc(locationId)
      .collection("shifts")
      .where("altId", "in", ["repeat", scheduleDocId])
      .get();

    const targetUsersIds: string[] = uniq(
      getShifts.docs.map((d) => d.get("employeeId"))
    );
    if (!targetUsersIds.length) {
      return;
    }
    const locatioData = (
      await firestore().collection("Locations").doc(locationId).get()
    ).data();
    if (!locatioData) {
      return;
    }
    const { name: locationName, organizationId } = locatioData;

    const realtimeNotifications: { [key: string]: any } = {};
    for (const targetUser of targetUsersIds) {
      realtimeNotifications[
        `users/${targetUser}/notifications/${organizationId}/locations/${locationId}/sch/${scheduleDocId}`
      ] = database.ServerValue.increment(1);
    }

    try {
      await database().ref().update(realtimeNotifications);
      await sendNotificationToUids({
        include_external_user_ids: targetUsersIds,
        app_id: MainVariables.oneSignalAppId,
        contents: {
          en: `Your schedule has been updated in ${locationName}`,
          es: `Su horario ha sido actualizado en ${locationName}`,
        },
        headings: {
          en: `📅 Schedule updated`,
          es: `📅 Horario actualizado`,
        },
      });
    } catch (error) {
      const { code, message } = error as FirebaseError;
      throw new functions.https.HttpsError(
        "failed-precondition",
        JSON.stringify({ code, message })
      );
    }
  });
