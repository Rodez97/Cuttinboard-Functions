import { Organization } from "@cuttinboard-solutions/types-helpers";
import Stripe from "stripe";
import { MainVariables } from "../../config";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger, auth } from "firebase-functions";

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

export default onDocumentUpdated(
  "Organizations/{organizationId}",
  async (event) => {
    const { data } = event;
    const beforeData = data?.before.data() as Organization;
    const afterData = data?.after.data() as Organization;

    const beforeLocations = beforeData?.locations ?? 0;
    const afterLocations = afterData?.locations ?? 0;

    const hadMultipleLocations = afterData?.hadMultipleLocations || false;

    if (beforeLocations === afterLocations) {
      return;
    }

    if (!hadMultipleLocations && afterLocations > 1) {
      await data?.after.ref.update({
        hadMultipleLocations: true,
      });
    }

    const { subscriptionId, subItemId } = afterData;

    try {
      // Create the stripe usage record with the new quantity
      await stripe.subscriptions.update(subscriptionId, {
        items: [
          {
            id: subItemId,
            quantity: afterLocations,
          },
        ],
      });
    } catch (error: any) {
      logger.error(error);
      throw new auth.HttpsError("unknown", error.message);
    }
  }
);
