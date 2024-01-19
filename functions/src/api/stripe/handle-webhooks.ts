import Stripe from "stripe";
import { handleError } from "../../services/handleError";
import {
  createProductRecord,
  deleteProductOrPrice,
  insertPriceRecord,
  insertTaxRateRecord,
  manageSubscriptionStatusChange,
  attachPaymentMethod,
  detachPaymentMethod,
  deleteOrganization,
} from "../../services/stripe";
import { firestore } from "firebase-admin";
import { HttpsError, onRequest } from "firebase-functions/v2/https";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
  // Register extension as a Stripe plugin
  // https://stripe.com/docs/building-plugins#setappinfo
  appInfo: {
    name: "Cuttinboard-Firebase",
    version: "0.1",
  },
});

async function onSubChange(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const subId = subscription.id;
  const customerId = subscription.customer as string;
  const organizationId = subscription.metadata?.firebaseUID;
  const status = subscription.status;

  if (!organizationId) {
    // If the organization ID is not present then throw an error
    throw new HttpsError(
      "invalid-argument",
      "The organization ID is not present!"
    );
  }

  if (status === "incomplete" || status === "incomplete_expired") {
    // If the subscription is incomplete or incomplete_expired then throw an error
    throw new HttpsError(
      "invalid-argument",
      "The subscription is incomplete or incomplete_expired!"
    );
  }

  if (status === "canceled" || event.type === "customer.subscription.deleted") {
    await deleteOrganization(organizationId);
  }

  switch (event.type) {
    case "customer.subscription.updated":
      await manageSubscriptionStatusChange(
        stripe,
        subId,
        customerId,
        organizationId
      );
      break;
    case "customer.subscription.created":
      await manageSubscriptionStatusChange(
        stripe,
        subId,
        customerId,
        organizationId,
        true
      );
      break;
  }
}

export default onRequest({ cors: [/stripe/] }, async (req, resp) => {
  const relevantEvents = new Set([
    "product.created",
    "product.updated",
    "product.deleted",
    "price.created",
    "price.updated",
    "price.deleted",
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "tax_rate.created",
    "tax_rate.updated",
    "payment_method.attached",
    "payment_method.detached",
    "customer.deleted",
  ]);
  let event: Stripe.Event;

  // Instead of getting the `Stripe.Event`
  // object directly from `req.body`,
  // use the Stripe webhooks API to make sure
  // this webhook call came from a trusted source
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      req.headers["stripe-signature"]!,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    resp.status(401).send("Webhook Error: Invalid Secret");
    return;
  }

  if (relevantEvents.has(event.type)) {
    try {
      switch (event.type) {
        case "product.created":
        case "product.updated":
          await createProductRecord(event.data.object as Stripe.Product);
          break;
        case "price.created":
        case "price.updated":
          await insertPriceRecord(event.data.object as Stripe.Price, stripe);
          break;
        case "product.deleted":
          await deleteProductOrPrice(event.data.object as Stripe.Product);
          break;
        case "price.deleted":
          await deleteProductOrPrice(event.data.object as Stripe.Price);
          break;
        case "tax_rate.created":
        case "tax_rate.updated":
          await insertTaxRateRecord(event.data.object as Stripe.TaxRate);
          break;
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
        case "customer.subscription.created":
          await onSubChange(event);
          break;
        case "payment_method.attached":
          await attachPaymentMethod(event.data.object as Stripe.PaymentMethod);
          break;
        case "payment_method.detached":
          await detachPaymentMethod(event.data);
          break;
        case "customer.deleted":
          await customerDeleted(event);
          break;
        default:
          break;
      }
    } catch (error) {
      resp.json({
        error: "Webhook handler failed. View function logs in Firebase.",
      });
      handleError(error);
    }
  }

  // Return a response to Stripe to acknowledge receipt of the event.
  resp.json({ received: true });
});

const customerDeleted = async (event: Stripe.Event) => {
  const customer = event.data.object as Stripe.Customer;
  const uid = customer.metadata?.firebaseUID;

  if (!uid) {
    // If the organization ID is not present then throw an error
    throw new HttpsError(
      "invalid-argument",
      "The organization ID is not present!"
    );
  }
  // Delete the customer from your database
  await firestore().collection("Users").doc(uid).update({
    customerId: firestore.FieldValue.delete(),
  });
};
