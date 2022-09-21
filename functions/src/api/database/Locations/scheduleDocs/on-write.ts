import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import customParseFormat from "dayjs/plugin/customParseFormat";
import isoWeek from "dayjs/plugin/isoWeek";
import Expo, { ExpoPushMessage } from "expo-server-sdk";
import { database, FirebaseError, firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { chunk, uniq } from "lodash";
import { sendExpoChunkNotifications } from "../../../../services/expo";
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

    const targetEmployeesDocuments = chunk(targetUsersIds, 10).map(
      (targetUser) =>
        firestore()
          .collection("Organizations")
          .doc(organizationId)
          .collection("employees")
          .where(firestore.FieldPath.documentId(), "in", targetUser)
          .get()
    );
    const tedResponse = await Promise.all(targetEmployeesDocuments);
    const targetUsers = tedResponse.map((res) => res.docs).flat();

    const messages: ExpoPushMessage[] = [];
    const realtimeNotifications: { [key: string]: any } = {};
    const notificationId = `sch_${scheduleDocId}`;
    for (const targetUser of targetUsers) {
      const { id } = targetUser;
      const { expoToolsTokens } = targetUser.data();
      realtimeNotifications[
        `users/${id}/notifications/${organizationId}/locations/${locationId}/sch/${scheduleDocId}`
      ] = database.ServerValue.increment(1);
      if (!expoToolsTokens) {
        continue;
      }
      for (const token of expoToolsTokens) {
        if (!Expo.isExpoPushToken(token)) {
          functions.logger.error(
            `Push token ${token} is not a valid Expo push token`
          );
          continue;
        }
        messages.push({
          to: token,
          title: `📅 Schedule updated`,
          sound: "default",
          body: `${locationName}`,
          data: {
            organizationId,
            locationId,
            id: notificationId,
            type: "schedule",
          },
          channelId: "Schedule",
        });
      }
    }

    try {
      await database().ref().update(realtimeNotifications);
      await sendExpoChunkNotifications(messages);
    } catch (error) {
      const { code, message } = error as FirebaseError;
      throw new functions.https.HttpsError(
        "failed-precondition",
        JSON.stringify({ code, message })
      );
    }
  });
