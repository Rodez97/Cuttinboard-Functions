import { FirebaseError, firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import Stripe from "stripe";
import MainVariables from "../../../config";

/**
 * Borrar todas las subcolecciones y recursos de almacenamiento de una locación
 * cuando esta es cancelada/eliminada **definitivamente** por el usuario dueño de la misma.
 */
export default functions.firestore
  .document(`/Locations/{locationId}`)
  .onCreate(async (change) => {
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

    const { organizationId, subItemId } = change.data();

    if (!organizationId) {
      functions.logger.error(
        "The location was created without an organization id and must be eliminated"
      );
      await change.ref.delete();
      return;
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

    try {
      await firestore()
        .collection("Organizations")
        .doc(organizationId)
        .update({ locations: firestore.FieldValue.increment(1) });
      await stripe.subscriptionItems.createUsageRecord(subItemId, {
        quantity: locations ? Number(locations + 1) : 1,
        action: "set",
      });
    } catch (error) {
      const { code, message } = error as FirebaseError;
      throw new functions.https.HttpsError(
        "failed-precondition",
        JSON.stringify({ code, message })
      );
    }
  });
