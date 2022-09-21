import { FirebaseError, firestore } from "firebase-admin";
import { https } from "firebase-functions";
import short from "short-uuid";
import Stripe from "stripe";
import MainVariables from "../../../config";
import RoleAccessLevels from "../../../models/RoleAccessLevels";
import { inviteEmployee } from "../../../services/employees";

const stripe = new Stripe(MainVariables.stripeSecretKey, {
  apiVersion: "2020-08-27",
  // Register extension as a Stripe plugin
  // https://stripe.com/docs/building-plugins#setappinfo
  appInfo: {
    name: "Cuttinboard-Firebase",
    version: "0.1",
  },
});

export default https.onCall(async (data, context) => {
  const { auth } = context;
  // Checking that the user is authenticated.
  if (!auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new https.HttpsError(
      "failed-precondition",
      "The function must be called while authenticated!"
    );
  }
  const { location, generalManager } = data;
  const { uid, email } = auth.token;

  if (!email || !uid || !location) {
    return;
  }

  // Get user data
  const userDocument = (
    await firestore().collection("Users").doc(uid).get()
  ).data();

  if (!userDocument) {
    throw new https.HttpsError(
      "failed-precondition",
      "The user doesn't exist in Firestore!"
    );
  }
  const { customerId, subscriptionId } = userDocument;

  const batch = firestore().batch();

  if (!customerId || !subscriptionId) {
    throw new https.HttpsError(
      "failed-precondition",
      "The user is not a customer!"
    );
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price.product"],
    });
    const { metadata } = subscription.items.data[0].price
      .product as Stripe.Product;

    const locationId = short.generate();
    const locationRef = firestore().collection("Locations").doc(locationId);
    const locationMain = {
      ...location,
      subscriptionStatus: subscription.status,
      employeesCount: 0,
      storageUsed: 0,
      limits: metadata,
      organizationId: uid,
      subscriptionId,
      subItemId: subscription.items.data[0].id,
      supervisors: [],
    };
    batch.set(locationRef, locationMain, { merge: true });

    await batch.commit();

    // Add general manager employee data if it exists
    if (
      generalManager?.email &&
      generalManager?.name &&
      generalManager?.lastName
    ) {
      await inviteEmployee(
        generalManager.name,
        generalManager.lastName,
        generalManager.email,
        locationId,
        uid,
        RoleAccessLevels.GENERAL_MANAGER,
        [],
        "",
        {}
      );
    }

    return { customerId, subscriptionId, organizationId: uid };
  } catch (error) {
    const { code, message } = error as FirebaseError;
    throw new https.HttpsError(
      "failed-precondition",
      JSON.stringify({ code, message })
    );
  }
});
