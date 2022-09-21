import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import customParseFormat from "dayjs/plugin/customParseFormat";
import isoWeek from "dayjs/plugin/isoWeek";
import Expo, { ExpoPushMessage } from "expo-server-sdk";
import { database, firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { sendExpoChunkNotifications } from "../../../../../services/expo";
dayjs.extend(isoWeek);
dayjs.extend(advancedFormat);
dayjs.extend(customParseFormat);

export default functions.firestore
  .document(
    `/Organizations/{organizationId}/todo/{todoId}/content/{taskBlockId}`
  )
  .onWrite(async (change, context) => {
    if (change.before.exists && !change.after.exists) {
      // Document was deleted
      return;
    }
    const afterData = change.after.data();
    if (!afterData) {
      // Document was deleted
      return;
    }

    const bAssignedTo = change.before.get("assignedTo");
    const { assignedTo } = afterData;
    if (!assignedTo || assignedTo === bAssignedTo) {
      return;
    }
    const { organizationId, todoId } = context.params;
    try {
      const employeeDoc = (
        await firestore()
          .collection("Organizations")
          .doc(organizationId)
          .collection("employees")
          .doc(assignedTo)
          .get()
      ).data();
      if (!employeeDoc) {
        return;
      }
      const { expoToolsTokens } = employeeDoc;
      const tasksBoardData = (
        await firestore()
          .collection("Organizations")
          .doc(organizationId)
          .collection("todo")
          .doc(todoId)
          .get()
      ).data();
      if (!tasksBoardData) {
        return;
      }
      const { name: boardName, locationId } = tasksBoardData;
      const locationData = (
        await firestore().collection("Locations").doc(locationId).get()
      ).data();
      if (!locationData) {
        return;
      }
      const { name: locationName } = locationData;
      await database()
        .ref(
          `users/${assignedTo}/notifications/${organizationId}/locations/${locationId}/task/${todoId}`
        )
        .set(database.ServerValue.increment(1));
      if (!expoToolsTokens) {
        return;
      }
      const messages: ExpoPushMessage[] = [];
      for (const token of expoToolsTokens) {
        if (!Expo.isExpoPushToken(token)) {
          functions.logger.error(
            `Push token ${token} is not a valid Expo push token`
          );
          continue;
        }
        messages.push({
          to: token,
          title: `📋 Tasks Assigned (${locationName})`,
          sound: "default",
          body: `in ${boardName}`,
          data: {
            organizationId,
            locationId,
            id: `tsk_${todoId}`,
            type: "tasks",
          },
          channelId: "Tasks",
        });
      }
      await sendExpoChunkNotifications(messages);
    } catch (error) {
      functions.logger.error(error);
    }
  });
