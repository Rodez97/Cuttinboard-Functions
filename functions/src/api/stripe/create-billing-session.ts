import { firestore } from "firebase-admin";
import { https } from "firebase-functions";
import Stripe from "stripe";
import { MainVariables } from "../../config";
import { cuttinboardUserConverter } from "../../models/converters/cuttinboardUserConverter";

export default https.onCall(async (return_url, context) => {
  if (!context.auth) {
    // If the user is not authenticated
    throw new https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  if (typeof return_url !== "string" || !return_url) {
    // If the return_url is not valid then throw an error
    throw new https.HttpsError(
      "invalid-argument",
      "The function must be called with a valid return_url!"
    );
  }

  const { uid } = context.auth;

  // Get the user document
  const userDocument = await firestore()
    .collection("Users")
    .doc(uid)
    .withConverter(cuttinboardUserConverter)
    .get();

  const userDocumentData = userDocument.data();

  if (!userDocument.exists || !userDocumentData) {
    // If the user document does not exist then throw an error
    throw new https.HttpsError(
      "not-found",
      "The user document does not exist!"
    );
  }

  const { customerId } = userDocumentData;

  if (!customerId) {
    // If the user does not have a customer ID then throw an error
    throw new https.HttpsError(
      "failed-precondition",
      "The user does not have a customer ID!"
    );
  }

  try {
    // Initialize Stripe
    const stripe = new Stripe(MainVariables.stripeSecretKey, {
      apiVersion: "2020-08-27",
      // Register extension as a Stripe plugin
      // https://stripe.com/docs/building-plugins#setappinfo
      appInfo: {
        name: "Cuttinboard-Firebase",
        version: "0.1",
      },
    });

    // Create a billing session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url,
    });

    // Return the session url
    return session.url;
  } catch (error) {
    throw new https.HttpsError(
      "failed-precondition",
      "The user can't create the session!",
      error
    );
  }
});
