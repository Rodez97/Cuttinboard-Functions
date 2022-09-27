import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import customParseFormat from "dayjs/plugin/customParseFormat";
import isoWeek from "dayjs/plugin/isoWeek";
import { database, FirebaseError, firestore } from "firebase-admin";
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
    const assignedTo: string = snap.get("assignedTo.id");
    if (!assignedTo) {
      return;
    }

    const { organizationId, todoId } = context.params;

    let boardName: string;
    let locationId: string;
    let locationName: string;
    try {
      const todoMainSnap = await firestore()
        .collection("Organizations")
        .doc(organizationId)
        .collection("todo")
        .doc(todoId)
        .get();
      if (!todoMainSnap.exists) {
        throw new Error("The TODO board doesn't exists");
      }
      boardName = todoMainSnap.get("name");
      locationId = todoMainSnap.get("locationId");
    } catch (error) {
      const { message } = error as Error;
      throw new functions.https.HttpsError("failed-precondition", message);
    }

    try {
      const locationSnap = await firestore()
        .collection("Locations")
        .doc(locationId)
        .get();
      if (!locationSnap.exists) {
        throw new Error("The Location document doesn't exists");
      }
      locationName = locationSnap.get("name");
    } catch (error) {
      const { message } = error as Error;
      throw new functions.https.HttpsError("failed-precondition", message);
    }

    try {
      const updates: { [key: string]: any } = {};
      updates[
        `users/${assignedTo}/notifications/${organizationId}/locations/${locationId}/task/${todoId}`
      ] = database.ServerValue.increment(1);

      await database().ref().update(updates);

      await sendNotificationToUids({
        include_external_user_ids: [assignedTo],
        app_id: MainVariables.oneSignalAppId,
        contents: {
          en: `You have been assigned tasks on board ${boardName} at location ${locationName}`,
          es: `Se le han asignado tareas en la lista ${boardName} de la locación ${locationName}`,
        },
        headings: {
          en: `📋 Tasks Assigned (${locationName})`,
          es: `📋 Tareas asignadas (${locationName})`,
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
