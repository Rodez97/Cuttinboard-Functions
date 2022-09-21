import { https } from "firebase-functions";
import Stripe from "stripe";
import MainVariables from "../../config";
import {
  createProductRecord,
  deleteProductOrPrice,
  insertInvoiceRecord,
  insertPriceRecord,
  insertTaxRateRecord,
  manageSubscriptionStatusChange,
  updatePaymentMethodRecord,
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
    "invoice.paid",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
    "invoice.upcoming",
    "invoice.updated",
    "invoice.marked_uncollectible",
    "invoice.payment_action_required",
    "payment_intent.processing",
    "payment_intent.succeeded",
    "payment_intent.canceled",
    "payment_intent.payment_failed",
    "payment_method.attached",
    "payment_method.automatically_updated",
    "payment_method.detached",
    "payment_method.updated",
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
        case "checkout.session.completed":
          // const checkoutSession = event.data
          //   .object as Stripe.Checkout.Session;
          // const subscriptionId = checkoutSession.subscription as string;
          // await manageSubscriptionStatusChange(
          //   subscriptionId,
          //   checkoutSession.customer as string,
          //   checkoutSession.mode === "subscription" &&
          //     checkoutSession.payment_status === "paid"
          // );
          // if (checkoutSession.tax_id_collection?.enabled) {
          //   const customersSnap = await firestore()
          //     .collection("Users")
          //     .where("customerId", "==", checkoutSession.customer as string)
          //     .get();
          //   if (customersSnap.size === 1) {
          //     customersSnap.docs[0].ref.set(
          //       { customer_details: checkoutSession.customer_details! },
          //       {
          //         merge: true,
          //       }
          //     );
          //   }
          // }
          break;
        case "invoice.payment_failed":
        case "invoice.paid":
        case "invoice.payment_succeeded":
        case "invoice.upcoming":
        case "invoice.updated":
        case "invoice.marked_uncollectible":
        case "invoice.payment_action_required":
          const invoice = event.data.object as Stripe.Invoice;
          await insertInvoiceRecord(invoice);
          break;
        case "payment_method.attached":
        case "payment_method.automatically_updated":
        case "payment_method.updated":
          const paymentMethod = event.data.object as Stripe.PaymentMethod;
          await updatePaymentMethodRecord(paymentMethod, stripe);
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
