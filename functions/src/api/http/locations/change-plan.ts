import { firestore } from "firebase-admin";
import Stripe from "stripe";
import { MainVariables } from "../../../config";
import { cuttinboardUserConverter } from "../../../models/converters/cuttinboardUserConverter";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { SubTier } from "@cuttinboard-solutions/types-helpers";
import { GrpcStatus } from "firebase-admin/firestore";
import { locationConverter } from "../../../models/converters/locationConverter";
import { removeAllConversation } from "../../Locations/on-delete";

// Initialize Stripe
const stripe = new Stripe(MainVariables.stripeSecretKey, {
  apiVersion: "2022-11-15",
  // Register extension as a Stripe plugin
  // https://stripe.com/docs/building-plugins#setappinfo
  appInfo: {
    name: "Cuttinboard-Firebase",
    version: "0.1",
  },
});

export default onCall<{
  priceId: string;
  from: SubTier;
  to: SubTier;
}>({ cors: [/cuttinboard/] }, async (request) => {
  const { auth, data } = request;

  if (!auth || !auth.token || !auth.token.email) {
    // If the user is not authenticated
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  // Location creation data
  const { priceId, from, to } = data;

  const { uid } = auth.token;

  if (!priceId) {
    // If the required data is not provided then return an error.
    throw new HttpsError(
      "invalid-argument",
      "The function must be called with valid data!"
    );
  }

  // Get user data
  const userDocument = (
    await firestore()
      .collection("Users")
      .doc(uid)
      .withConverter(cuttinboardUserConverter)
      .get()
  ).data();

  if (!userDocument) {
    // If the user does not exist then return an error.
    throw new HttpsError("not-found", "The user document does not exist!");
  }

  const { subscriptionId } = userDocument;

  if (!subscriptionId) {
    throw new HttpsError(
      "failed-precondition",
      "The user does not have a subscription!"
    );
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const subscriptionItem = subscription.items.data[0];
    const quantity = subscriptionItem.quantity;
    const currentPriceId = subscriptionItem.price.id;

    if (currentPriceId === priceId) {
      throw new HttpsError(
        "failed-precondition",
        "The user is already subscribed to this plan!"
      );
    }

    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
      items: [
        {
          id: subscriptionItem.id,
          price: priceId,
          quantity,
        },
      ],
      proration_behavior: "create_prorations",
    });

    // Delete the resources for the old plan
    if (from === "pro" && to === "basic") {
      logger.log("Deleting resources for the old plan");
      await clearDataFromOldPlan(uid);
    }
  } catch (error: any) {
    logger.error(error);
    throw new HttpsError("unknown", error.message);
  }
});

const clearDataFromOldPlan = async (organizationId: string) => {
  // Create a bulk writer instance
  const bulkWriter = firestore().bulkWriter();
  // Set the error handler on the bulkWriter
  bulkWriter.onWriteError((error) => {
    if (error.code === GrpcStatus.NOT_FOUND) {
      logger.log("Document does not exist: ", error.documentRef.path);
      return false;
    }
    if (error.failedAttempts < 10) {
      return true;
    } else {
      return false;
    }
  });

  const locations = await firestore()
    .collection("Locations")
    .where("organizationId", "==", organizationId)
    .withConverter(locationConverter)
    .get();

  if (locations.empty) {
    return;
  }

  const clearConversations = locations.docs.map(async (location) => {
    await removeAllConversation(location.id, bulkWriter);

    // Delete notes
    const notesRef = location.ref.collection("notes");
    await firestore().recursiveDelete(notesRef);

    // Delete files
    const filesRef = location.ref.collection("files");
    await firestore().recursiveDelete(filesRef);

    // Delete globals
    const globalsRef = location.ref.collection("globals");
    await firestore().recursiveDelete(globalsRef);

    // Delete utensils
    const utensilsRef = location.ref.collection("utensils");
    await firestore().recursiveDelete(utensilsRef);
  });

  await Promise.all(clearConversations);

  await bulkWriter.close();
};
