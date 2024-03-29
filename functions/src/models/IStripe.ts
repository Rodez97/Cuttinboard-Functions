import { firestore } from "firebase-admin";
import Stripe from "stripe";

export interface CustomerData {
  metadata: {
    firebaseUID: string;
  };
  email?: string;
}

export interface Price {
  /**
   * Whether the price can be used for new purchases.
   */
  active: boolean;
  currency: string;
  unit_amount: number;
  /**
   * A brief description of the price.
   */
  description: string | null;
  /**
   * One of `one_time` or `recurring` depending on whether the price is for a one-time purchase or a recurring (subscription) purchase.
   */
  type: "one_time" | "recurring";
  /**
   * The frequency at which a subscription is billed. One of `day`, `week`, `month` or `year`.
   */
  interval: "day" | "month" | "week" | "year" | null;
  /**
   * The number of intervals (specified in the `interval` attribute) between subscription billings. For example, `interval=month` and `interval_count=3` bills every 3 months.
   */
  interval_count: number | null;
  /**
   * Default number of trial days when subscribing a customer to this price using [`trial_from_plan=true`](https://stripe.com/docs/api#create_subscription-trial_from_plan).
   */
  trial_period_days: number | null;
  /**
   * Any additional properties
   */
  [propName: string]: any;
}

export interface Product {
  /**
   * Whether the product is currently available for purchase.
   */
  active: boolean;
  /**
   * The product's name, meant to be displayable to the customer. Whenever this product is sold via a subscription, name will show up on associated invoice line item descriptions.
   */
  name: string;
  /**
   * The product's description, meant to be displayable to the customer. Use this field to optionally store a long form explanation of the product being sold for your own rendering purposes.
   */
  description: string | null;
  /**
   * The role that will be assigned to the user if they are subscribed to this plan.
   */
  role: string | null;
  /**
   * A list of up to 8 URLs of images for this product, meant to be displayable to the customer.
   */
  images: Array<string>;
  /**
   * A list of Prices for this billing product.
   */
  prices?: Array<Price>;
  /**
   * Any additional properties
   */
  [propName: string]: any;
}

export interface Subscription {
  /**
   * Set of key-value pairs that you can attach to an object.
   * This can be useful for storing additional information about the object in a structured format.
   */
  metadata: {
    [name: string]: string;
  };
  stripeLink: string;
  quantity: number;
  items: Stripe.SubscriptionItem[];
  /**
   * Firestore reference to the product doc for this Subscription.
   */
  product: firestore.DocumentReference;
  /**
   * Firestore reference to the price for this Subscription.
   */
  price: firestore.DocumentReference;
  /**
   * The status of the subscription object
   */
  status:
    | "active"
    | "canceled"
    | "incomplete"
    | "incomplete_expired"
    | "past_due"
    | "trialing"
    | "unpaid";
  /**
   * If true the subscription has been canceled by the user and will be deleted at the end of the billing period.
   */
  cancel_at_period_end: boolean;
  /**
   * Time at which the object was created.
   */
  created: null | firestore.Timestamp;
  /**
   * Start of the current period that the subscription has been invoiced for.
   */
  current_period_start: null | firestore.Timestamp;
  /**
   * End of the current period that the subscription has been invoiced for. At the end of this period, a new invoice will be created.
   */
  current_period_end: null | firestore.Timestamp;
  /**
   * If the subscription has ended, the timestamp of the date the subscription ended.
   */
  ended_at: null | firestore.Timestamp;
  /**
   * A date in the future at which the subscription will automatically get canceled.
   */
  cancel_at: null | firestore.Timestamp;
  /**
   * If the subscription has been canceled, the date of that cancellation. If the subscription was canceled with `cancel_at_period_end`, `canceled_at` will still reflect the date of the initial cancellation request, not the end of the subscription period when the subscription is automatically moved to a canceled state.
   */
  canceled_at: null | firestore.Timestamp;
  /**
   * If the subscription has a trial, the beginning of that trial.
   */
  trial_start: null | firestore.Timestamp;
  /**
   * If the subscription has a trial, the end of that trial.
   */
  trial_end: null | firestore.Timestamp;
  pending_update?: boolean;
  latest_invoice?: string;
  default_payment_method: string | Stripe.PaymentMethod | null;
  discount: Stripe.Discount | null;
}

export interface TaxRate extends Stripe.TaxRate {
  /**
   * Any additional properties
   */
  [propName: string]: any;
}
