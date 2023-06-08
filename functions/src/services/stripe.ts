import {
  ILocation,
  LocationSubscriptionStatus,
} from "@cuttinboard-solutions/types-helpers";
import { firestore } from "firebase-admin";
import { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { uniq } from "lodash";
import Stripe from "stripe";
import { MainVariables } from "../config";
import { Price, Product, Subscription, TaxRate } from "../models/IStripe";
import { locationConverter } from "../models/converters/locationConverter";
import { clearUserClaims } from "./auth";
import { handleError } from "./handleError";

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

export async function attachPaymentMethod(paymentMethod: Stripe.PaymentMethod) {
  // Get customer's UID from Firestore
  const customersSnap = await firestore()
    .collection(MainVariables.customersCollectionPath)
    .where("customerId", "==", paymentMethod.customer)
    .get();
  if (customersSnap.size !== 1) {
    throw new Error("User not found!");
  }
  await customersSnap.docs[0].ref.update({
    paymentMethods: firestore.FieldValue.arrayUnion(paymentMethod.id),
  });
}

export async function detachPaymentMethod(eventData: Stripe.Event.Data) {
  const paymentMethod = eventData.object as Stripe.PaymentMethod;
  const previousCustomer = eventData.previous_attributes?.[
    "customer"
  ] as string;
  // Get customer's UID from Firestore
  const customersSnap = await firestore()
    .collection(MainVariables.customersCollectionPath)
    .where("customerId", "==", previousCustomer)
    .get();
  if (customersSnap.size !== 1) {
    throw new Error("User not found!");
  }
  await customersSnap.docs[0].ref.update({
    paymentMethods: firestore.FieldValue.arrayRemove(paymentMethod.id),
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
    expand: ["default_payment_method", "items.data.price.product", "discount"],
  });
  const bulkWriter = firestore().bulkWriter();
  const { price, quantity } = subscription.items.data[0];
  const product = price.product as Stripe.Product;

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
    metadata: { owner: organizationId, customer: customerId },
    default_payment_method: subscription.default_payment_method,
    discount: subscription.discount,
  };

  bulkWriter.set(
    firestore()
      .collection("Users")
      .doc(organizationId)
      .collection("subscription")
      .doc("subscriptionDetails"),
    subscriptionDetails,
    { merge: true }
  );

  if (createAction) {
    try {
      await bulkWriter.close();
    } catch (error) {
      handleError(error);
    }
    return;
  }

  bulkWriter.update(
    firestore().collection("Organizations").doc(organizationId),
    {
      subscriptionStatus: subscription.status,
    }
  );

  try {
    const needToClean = !["trialing", "active"].includes(subscription.status);

    const members = await getMembersAndUpdateStatus(
      bulkWriter,
      subscription.status,
      needToClean,
      organizationId
    );

    const membersToClean = uniq([...members, organizationId]);

    await bulkWriter.close();

    // If subscription status !== "trialing", "active"
    if (needToClean && membersToClean.length > 0) {
      await clearUserClaims(membersToClean, organizationId);
    }
  } catch (error) {
    handleError(error);
  }
};

const getMembersAndUpdateStatus = (
  bulkWriter: firestore.BulkWriter,
  subscriptionStatus: LocationSubscriptionStatus,
  needToClean: boolean,
  organizationId: string
) =>
  new Promise<string[]>((resolve) => {
    const locationsRef = firestore()
      .collection("Locations")
      .where("organizationId", "==", organizationId)
      .withConverter(locationConverter);

    let membersList: string[] = [];

    locationsRef
      .stream()
      .on("data", (documentSnapshot: QueryDocumentSnapshot<ILocation>) => {
        bulkWriter.update(documentSnapshot.ref, {
          subscriptionStatus,
        });
        if (needToClean) {
          const { members, supervisors } = documentSnapshot.data();

          if (members) {
            membersList = [...membersList, ...members];
          }

          if (supervisors) {
            membersList = [...membersList, ...supervisors];
          }
        }
      })
      .on("end", () => {
        const uniqMembers = uniq(membersList);
        resolve(uniqMembers);
      });
  });

export async function deleteOrganization(organizationId: string) {
  const bulkWriter = firestore().bulkWriter();

  // Delete subscription details
  bulkWriter.delete(
    firestore()
      .collection("Users")
      .doc(organizationId)
      .collection("subscription")
      .doc("subscriptionDetails")
  );

  // Update user document
  bulkWriter.update(firestore().collection("Users").doc(organizationId), {
    subscriptionId: firestore.FieldValue.delete(),
  });

  // Delete the organization document
  bulkWriter.delete(
    firestore().collection("Organizations").doc(organizationId)
  );

  await bulkWriter.close();
}
