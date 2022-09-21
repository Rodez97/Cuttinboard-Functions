import { firestore } from "firebase-admin";
import { uniq } from "lodash";
import Stripe from "stripe";
import MainVariables from "../config";
import { Price, Product, Subscription, TaxRate } from "../models/IStripe";
import { clearUserClaims } from "./auth";

export const stripeTimeToTimestamp = (time: number | null | undefined) =>
  time ? firestore.Timestamp.fromMillis(time * 1000) : null;

/**
 * Prefix Stripe metadata keys with `stripe_metadata_` to be spread onto Product and Price docs in Cloud Firestore.
 */
export const prefixMetadata = (metadata: Record<string, any>) =>
  Object.keys(metadata).reduce((prefixedMetadata: Record<string, any>, key) => {
    prefixedMetadata[`stripe_metadata_${key}`] = metadata[key];
    return prefixedMetadata;
  }, {});

/**
 * Create a Product record in Firestore based on a Stripe Product object.
 */
export const createProductRecord = async (
  product: Stripe.Product
): Promise<void> => {
  const { firebaseRole, ...rawMetadata } = product.metadata;

  const productData: Product = {
    active: product.active,
    name: product.name,
    description: product.description,
    role: firebaseRole ?? null,
    images: product.images,
    metadata: product.metadata,
    tax_code: product.tax_code ?? null,
    ...prefixMetadata(rawMetadata),
  };
  const batch = firestore().batch();
  batch.set(
    firestore()
      .collection(MainVariables.productsCollectionPath)
      .doc(product.id),
    productData,
    { merge: true }
  );
  const locationsWithProduct = await firestore()
    .collection("Locations")
    .where("product", "==", product.id)
    .get();

  locationsWithProduct.forEach((lwp) =>
    batch.set(
      lwp.ref,
      {
        tier: rawMetadata.type,
        limits: {
          employees: rawMetadata.employees,
          storage: rawMetadata.storage,
        },
      },
      { merge: true }
    )
  );

  try {
    await batch.commit();
  } catch (error) {
    throw new Error("No se pudo ejecutar la actualización");
  }
};

/**
 * Create a price (billing price plan) and insert it into a subcollection in Products.
 */
export const insertPriceRecord = async (
  price: Stripe.Price,
  stripe: Stripe
): Promise<void> => {
  if (price.billing_scheme === "tiered")
    // Tiers aren't included by default, we need to retireve and expand.
    price = await stripe.prices.retrieve(price.id, { expand: ["tiers"] });

  const priceData: Price = {
    active: price.active,
    billing_scheme: price.billing_scheme,
    tiers_mode: price.tiers_mode,
    tiers: price.tiers ?? null,
    currency: price.currency,
    description: price.nickname,
    type: price.type,
    unit_amount: Number(price.unit_amount),
    recurring: price.recurring,
    interval: price.recurring?.interval ?? null,
    interval_count: price.recurring?.interval_count ?? null,
    trial_period_days: price.recurring?.trial_period_days ?? null,
    transform_quantity: price.transform_quantity,
    tax_behavior: price.tax_behavior ?? null,
    metadata: price.metadata,
    ...prefixMetadata(price.metadata),
  };
  const dbRef = firestore()
    .collection(MainVariables.productsCollectionPath)
    .doc(price.product as string)
    .collection("prices");
  await dbRef.doc(price.id).set(priceData, { merge: true });
};

/**
 * Insert tax rates into the products collection in Cloud Firestore.
 */
export const insertTaxRateRecord = async (
  taxRate: Stripe.TaxRate
): Promise<void> => {
  const taxRateData: Partial<TaxRate> = {
    ...taxRate,
  };
  await firestore()
    .collection(MainVariables.productsCollectionPath)
    .doc("tax_rates")
    .collection("tax_rates")
    .doc(taxRate.id)
    .set(taxRateData);
};

/**
 * Add invoice objects to Cloud Firestore.
 */
export const insertInvoiceRecord = async (invoice: Stripe.Invoice) => {
  // Get customer's UID from Firestore
  const customersSnap = await firestore()
    .collection(MainVariables.customersCollectionPath)
    .where("customerId", "==", invoice.customer)
    .get();
  if (customersSnap.size !== 1) {
    throw new Error("User not found!");
  }

  if (invoice.status === "deleted" || invoice.status === "void") {
    await firestore()
      .collection("Users")
      .doc(customersSnap.docs[0].id)
      .collection("invoices")
      .doc(invoice.id)
      .delete();
  } else {
    // Write to invoice to a subcollection on the subscription doc.
    await firestore()
      .collection("Users")
      .doc(customersSnap.docs[0].id)
      .collection("invoices")
      .doc(invoice.id)
      .set(invoice);
  }
};

export const deleteProductOrPrice = async (
  pr: Stripe.Product | Stripe.Price
) => {
  if (pr.object === "product") {
    await firestore()
      .collection(MainVariables.productsCollectionPath)
      .doc(pr.id)
      .delete();
  }
  if (pr.object === "price") {
    await firestore()
      .collection(MainVariables.productsCollectionPath)
      .doc((pr as Stripe.Price).product as string)
      .collection("prices")
      .doc(pr.id)
      .delete();
  }
};

export async function updatePaymentMethodRecord(
  paymentMethod: Stripe.PaymentMethod,
  stripe: Stripe
) {
  const customer = await stripe.customers.retrieve(
    paymentMethod.customer as string
  );
  if (customer.deleted) {
    return;
  }
  const newDefaultPaymentMethod =
    customer.invoice_settings.default_payment_method;

  if (!newDefaultPaymentMethod) {
    return;
  }
  const custSubs = await stripe.subscriptions.list({
    limit: 1,
    customer: customer.id,
  });

  if (custSubs.data.length === 0) {
    return;
  }
  await stripe.subscriptions.update(custSubs.data[0].id, {
    default_payment_method: newDefaultPaymentMethod as string,
  });
}

/**
 * Manage subscription status changes.
 */
export const manageSubscriptionStatusChange = async (
  stripe: Stripe,
  subscriptionId: string,
  customerId: string,
  organizationId: string,
  createAction?: boolean
): Promise<void> => {
  // Retrieve latest subscription status and write it to the Firestore
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["default_payment_method", "items.data.price.product"],
  });
  const batch = firestore().batch();
  const uid = organizationId;
  const { price, quantity } = subscription.items.data[0];
  const product = price.product as Stripe.Product;
  const prices = [];

  for (const item of subscription.items.data) {
    prices.push(
      firestore()
        .collection(MainVariables.productsCollectionPath)
        .doc((item.price.product as Stripe.Product).id)
        .collection("prices")
        .doc(item.price.id)
    );
  }

  // Update with new Subscription status & details
  const subscriptionDetails: Subscription = {
    status: subscription.status,
    stripeLink: `https://dashboard.stripe.com${
      subscription.livemode ? "" : "/test"
    }/subscriptions/${subscription.id}`,
    product: firestore()
      .collection(MainVariables.productsCollectionPath)
      .doc(product.id),
    price: firestore()
      .collection(MainVariables.productsCollectionPath)
      .doc(product.id)
      .collection("prices")
      .doc(price.id),
    prices,
    quantity: quantity ?? 0,
    items: subscription.items.data,
    cancel_at_period_end: subscription.cancel_at_period_end,
    cancel_at: stripeTimeToTimestamp(subscription.cancel_at),
    canceled_at: stripeTimeToTimestamp(subscription.canceled_at),
    current_period_start: stripeTimeToTimestamp(
      subscription.current_period_start
    ),
    current_period_end: stripeTimeToTimestamp(subscription.current_period_end),
    created: stripeTimeToTimestamp(subscription.created),
    ended_at: stripeTimeToTimestamp(subscription.ended_at),
    trial_start: stripeTimeToTimestamp(subscription.trial_start),
    trial_end: stripeTimeToTimestamp(subscription.trial_end),
    pending_update: subscription.pending_update !== null,
    latest_invoice: subscription.latest_invoice as string,
    metadata: { owner: uid, customer: customerId },
    default_payment_method: subscription.default_payment_method,
  };

  batch.set(
    firestore()
      .collection("Users")
      .doc(uid)
      .collection("subscription")
      .doc("subscriptionDetails"),
    subscriptionDetails,
    { merge: true }
  );

  if (createAction) {
    try {
      await batch.commit();
    } catch (error) {
      throw new Error("Error updating subscription");
    }
    return;
  }

  batch.update(firestore().collection("Organizations").doc(organizationId), {
    subscriptionStatus: subscription.status,
    cancellationDate: subscription.status === "canceled" ? new Date() : null,
  });

  const locations = await firestore()
    .collection("Locations")
    .where("organizationId", "==", organizationId)
    .get();

  let members: string[] = [];

  for (const location of locations.docs) {
    batch.update(location.ref, {
      subscriptionStatus: subscription.status,
    });
    const employees = location.get("members") ?? [];
    members = uniq([...members, ...employees]);
  }

  try {
    // If subscription status !== "trialing", "active"
    if (!["trialing", "active"].includes(subscription.status)) {
      await clearUserClaims(members, organizationId);
    }
    await batch.commit();
  } catch (error) {
    throw new Error("Error updating subscription");
  }
};
