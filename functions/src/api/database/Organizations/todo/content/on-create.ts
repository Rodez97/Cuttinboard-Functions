import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import customParseFormat from "dayjs/plugin/customParseFormat";
import isoWeek from "dayjs/plugin/isoWeek";
import { database, firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import MainVariables from "../../../../../config";
import { sendNotificationToUids } from "../../../../../services/oneSignal";
dayjs.extend(isoWeek);
dayjs.extend(advancedFormat);
dayjs.extend(customParseFormat);

export default functions.firestore
  .document(
    `/Organizations/{organizationId}/todo/{todoId}/content/{taskBlockId}`
  )
  .onCreate(async (snap, context) => {
    const assignedTo = snap.get("assignedTo.id");
    if (!assignedTo) {
      return;
    }

    const { organizationId, todoId } = context.params;
    try {
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
      const { name, locationId } = tasksBoardData;
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

      await sendNotificationToUids({
        include_external_user_ids: assignedTo,
        app_id: MainVariables.oneSignalAppId,
        contents: {
          en: `You have been assigned tasks on board ${name} at location ${locationName}`,
          es: `Se le han asignado tareas a bordo ${name} en la ubicación ${locationName}`,
        },
        headings: {
          en: `📋 Tasks Assigned (${locationName})`,
          es: `📋 Tareas asignadas (${locationName})`,
        },
      });
    } catch (error) {
      throw new functions.https.HttpsError(
        "unknown",
        "there was an error when processing notifications",
        error
      );
    }
  });
