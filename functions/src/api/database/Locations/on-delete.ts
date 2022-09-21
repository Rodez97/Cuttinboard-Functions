import { FirebaseError, firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { chunk } from "lodash";
import Stripe from "stripe";
import MainVariables from "../../../config";
import RoleAccessLevels from "../../../models/RoleAccessLevels";

/**
 * Borrar todas las subcolecciones y recursos de almacenamiento de una locación
 * cuando esta es cancelada/eliminada **definitivamente** por el usuario dueño de la misma.
 */
export default functions.firestore
  .document(`/Locations/{locationId}`)
  .onDelete(async (change, context) => {
    const stripe = new Stripe(MainVariables.stripeSecretKey, {
      apiVersion: "2020-08-27",
      // Register extension as a Stripe plugin
      // https://stripe.com/docs/building-plugins#setappinfo
      appInfo: {
        name: "Cuttinboard-Firebase",
        version: "0.1",
      },
    });

    if (!stripe) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Stripe Api not initialized"
      );
    }

    const { locationId } = context.params;

    const { members, organizationId, subItemId, supervisors } = change.data();

    const employeesRef = firestore()
      .collection("Organizations")
      .doc(organizationId)
      .collection("employees");

    const batch = firestore().batch();

    if (supervisors) {
      for (const supervisor of supervisors) {
        batch.update(employeesRef.doc(supervisor), {
          supervisingLocations: firestore.FieldValue.arrayRemove(locationId),
        });
      }
    }

    const appsElements = [
      "notes",
      "todo",
      "storage",
      "conversations",
      "directMessages",
    ];

    for await (const appsElement of appsElements) {
      const appsRef = firestore()
        .collection("Organizations")
        .doc(organizationId)
        .collection(appsElement);
      const apps = await appsRef.where("locationId", "==", locationId).get();
      for (const app of apps.docs) {
        batch.delete(app.ref);
      }
    }

    const empRequests = chunk(members, 10).map((membersChunk) =>
      employeesRef
        .where(firestore.FieldPath.documentId(), "in", membersChunk)
        .get()
    );
    const employeesResponse = await Promise.all(empRequests);
    const employees = employeesResponse.flatMap((response) => response.docs);

    for (const employee of employees) {
      const { role, locations } = employee.data();
      if (typeof role === "number" && role <= RoleAccessLevels.ADMIN) {
        batch.set(
          employee.ref,
          { locations: { [locationId]: firestore.FieldValue.delete() } },
          { merge: true }
        );
        continue;
      }
      const locationsCount = locations ? Object.keys(locations).length : 0;
      if (locationsCount === 1) {
        batch.delete(employee.ref);
      } else {
        batch.set(
          employee.ref,
          { locations: { [locationId]: firestore.FieldValue.delete() } },
          { merge: true }
        );
      }
    }

    const organizationSnap = await firestore()
      .collection("Organizations")
      .doc(organizationId)
      .get();
    const organizationData = organizationSnap.data();
    if (!organizationData) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Missing organizationData"
      );
    }
    const { locations } = organizationData;
    if (!subItemId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Missing subItemId"
      );
    }
    batch.update(firestore().collection("Organizations").doc(organizationId), {
      locations: locations ? Number(locations - 1) : 0,
    });

    try {
      await stripe.subscriptionItems.createUsageRecord(subItemId, {
        quantity: locations ? Number(locations - 1) : 0,
        action: "set",
      });
      await batch.commit();
      await firestore().recursiveDelete(change.ref);
    } catch (error) {
      const { code, message } = error as FirebaseError;
      throw new functions.https.HttpsError(
        "failed-precondition",
        JSON.stringify({ code, message })
      );
    }
  });
