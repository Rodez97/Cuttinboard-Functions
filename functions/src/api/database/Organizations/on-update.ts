import { Organization } from "@cuttinboard-solutions/types-helpers";
import * as functions from "firebase-functions";
import Stripe from "stripe";
import { MainVariables } from "../../../config";
import { handleError } from "../../../services/handleError";

export default functions.firestore
  .document("Organizations/{organizationId}")
  .onUpdate(async (change) => {
    const beforeData = change.before.data() as Organization;
    const afterData = change.after.data() as Organization;

    const beforeLocations = beforeData.locations ?? 0;

    const afterLocations = afterData.locations ?? 0;

    const hadMultipleLocations = Boolean(afterData.hadMultipleLocations);

    if (beforeLocations === afterLocations) {
      return;
    }

    if (!hadMultipleLocations && afterLocations > 1) {
      await change.after.ref.update({
        hadMultipleLocations: true,
      });
    }

    await updateStripeRecord(afterData.subItemId, afterLocations);
  });

async function updateStripeRecord(
  subscriptionItemId: string,
  quantity: number
) {
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

    // Create the stripe usage record with the new quantity
    await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
      quantity,
      action: "set",
    });
  } catch (error) {
    handleError(error);
  }
}
