import { firestore } from "firebase-admin";
import { https } from "firebase-functions";
import Stripe from "stripe";
import MainVariables from "../../config";

const stripe = new Stripe(MainVariables.stripeSecretKey, {
  apiVersion: "2020-08-27",
  // Register extension as a Stripe plugin
  // https://stripe.com/docs/building-plugins#setappinfo
  appInfo: {
    name: "Cuttinboard-Firebase",
    version: "0.1",
  },
});

export default https.onCall(async (return_url, context) => {
  // Checking that the user is authenticated.
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new https.HttpsError(
      "failed-precondition",
      "The function must be called while authenticated!"
    );
  }

  if (typeof return_url !== "string" || !return_url) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new https.HttpsError(
      "failed-precondition",
      "*return_url* must be a defined string"
    );
  }

  const { uid } = context.auth;
  const userDocument = await firestore().collection("Users").doc(uid).get();
  const userDocumentData = userDocument.data();

  if (!userDocument.exists || !userDocumentData) {
    throw new https.HttpsError(
      "failed-precondition",
      "There is no user document"
    );
  }

  const { customerId } = userDocumentData;

  if (!customerId) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new https.HttpsError(
      "failed-precondition",
      "Invalid or undefined *customerId*"
    );
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url,
    });

    return session.url;
  } catch (error) {
    throw new https.HttpsError(
      "failed-precondition",
      "The user can't create the session!",
      error
    );
  }
});
