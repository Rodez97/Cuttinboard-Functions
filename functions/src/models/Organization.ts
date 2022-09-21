import { firestore } from "firebase-admin";

type Organization = {
  customerId: string;
  locations: number;
  subItemId: string;
  subscriptionId: string;
  cancellationDate: firestore.Timestamp;
  subscriptionStatus:
    | "incomplete"
    | "incomplete_expired"
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "unpaid";
};

export default Organization;
