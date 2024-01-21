import { firestore } from "firebase-admin";
import Stripe from "stripe";
import { cuttinboardUserConverter } from "../../models/converters/cuttinboardUserConverter";
import { HttpsError, onCall } from "firebase-functions/v2/https";

export default onCall({ cors: true }, async (request) => {
  const { auth } = request;

  if (!auth) {
    // If the user is not authenticated
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const { uid } = auth;

  // Get the user document
  const userDocument = await firestore()
    .collection("Users")
    .doc(uid)
    .withConverter(cuttinboardUserConverter)
    .get();

  const userDocumentData = userDocument.data();

  if (!userDocument.exists || !userDocumentData) {
    // If the user document does not exist then throw an error
    throw new HttpsError("not-found", "The user document does not exist!");
  }

  const { customerId } = userDocumentData;

  if (!customerId) {
    // If the user does not have a customer ID then throw an error
    throw new HttpsError(
      "failed-precondition",
      "The user does not have a customer ID!"
    );
  }

  try {
    // Initialize Stripe
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
      // Register extension as a Stripe plugin
      // https://stripe.com/docs/building-plugins#setappinfo
      appInfo: {
        name: "Cuttinboard-Firebase",
        version: "0.1",
      },
    });

    // Create a billing session
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
    });

    // Return the session url
    return setupIntent.client_secret;
  } catch (error) {
    throw new HttpsError(
      "failed-precondition",
      "The user can't create the setup intent",
      error
    );
  }
});
