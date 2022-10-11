import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import customParseFormat from "dayjs/plugin/customParseFormat";
import isoWeek from "dayjs/plugin/isoWeek";
import { database, FirebaseError, firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { isEmpty } from "lodash";
import MainVariables from "../../../../config";
import { sendNotificationToUids } from "../../../../services/oneSignal";
dayjs.extend(isoWeek);
dayjs.extend(advancedFormat);
dayjs.extend(customParseFormat);

const WEEKFORMAT = "[W]-W-YYYY";

export default functions.firestore
  .document(`/Locations/{locationId}/scheduleDocs/{scheduleDocId}`)
  .onWrite(async (change, context) => {
    if (!change.after.exists) {
      return;
    }

    const notificationRecipients = change.after.get("notificationRecipients");

    if (isEmpty(notificationRecipients)) {
      return;
    }

    const { locationId, scheduleDocId } = context.params;

    const currentWeek = dayjs().format(WEEKFORMAT);
    const nextWeek = dayjs().add(1, "week").format(WEEKFORMAT);

    if (scheduleDocId !== currentWeek && scheduleDocId !== nextWeek) {
      return;
    }

    const targetUsersIds: string[] = notificationRecipients;

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
        `users/${targetUser}/notifications/organizations/${organizationId}/locations/${locationId}/sch/${scheduleDocId}`
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
      await change.after.ref.update({
        notificationRecipients: firestore.FieldValue.delete(),
      });
    } catch (error) {
      const { code, message } = error as FirebaseError;
      throw new functions.https.HttpsError(
        "failed-precondition",
        JSON.stringify({ code, message })
      );
    }
  });
