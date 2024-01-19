import { firestore } from "firebase-admin";
import Stripe from "stripe";
import { cuttinboardUserConverter } from "../../models/converters/cuttinboardUserConverter";
import { HttpsError, onCall } from "firebase-functions/v2/https";

export default onCall<string>(async (request) => {
  const { auth, data: return_url } = request;

  if (!auth) {
    // If the user is not authenticated
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  if (typeof return_url !== "string" || !return_url) {
    // If the return_url is not valid then throw an error
    throw new HttpsError(
      "invalid-argument",
      "The function must be called with a valid return_url!"
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
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url,
    });

    // Return the session url
    return session.url;
  } catch (error) {
    throw new HttpsError(
      "failed-precondition",
      "The user can't create the session!",
      error
    );
  }
});
