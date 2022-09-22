import { https } from "firebase-functions";
import Stripe from "stripe";
import MainVariables from "../../config";
import {
  createProductRecord,
  deleteProductOrPrice,
  insertPriceRecord,
  insertTaxRateRecord,
  manageSubscriptionStatusChange,
  attachPaymentMethod,
  detachPaymentMethod,
} from "../../services/stripe";

const stripe = new Stripe(MainVariables.stripeSecretKey, {
  apiVersion: "2020-08-27",
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
  if (!organizationId) {
    return;
  }
  switch (event.type) {
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
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
        !["incomplete", "incomplete_expired"].includes(subscription.status)
      );
      break;
  }
}

export default https.onRequest(async (req: https.Request, resp) => {
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
  ]);
  let event: Stripe.Event;

  // Instead of getting the `Stripe.Event`
  // object directly from `req.body`,
  // use the Stripe webhooks API to make sure
  // this webhook call came from a trusted source
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      req.headers["stripe-signature"]!,
      MainVariables.stripeWebhookSecret
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
          const attachedPaymentMethod = event.data
            .object as Stripe.PaymentMethod;
          await attachPaymentMethod(attachedPaymentMethod);
          break;
        case "payment_method.detached":
          const detachedPaymentMethod = event.data
            .object as Stripe.PaymentMethod;
          await detachPaymentMethod(detachedPaymentMethod);
          break;
        default:
          break;
      }
    } catch (error) {
      resp.json({
        error: "Webhook handler failed. View function logs in Firebase.",
      });
      return;
    }
  }

  // Return a response to Stripe to acknowledge receipt of the event.
  resp.json({ received: true });
});
