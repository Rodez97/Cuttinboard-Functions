import { firestore } from "firebase-admin";
import { https } from "firebase-functions";
import Stripe from "stripe";
import MainVariables from "../../config";
import RoleAccessLevels from "../../models/RoleAccessLevels";
import { getUserExpoTokens } from "../../services/users";

export default https.onCall(async (price, context) => {
  // Checking that the user is authenticated.
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new https.HttpsError(
      "failed-precondition",
      "The function must be called while authenticated!"
    );
  }

  const stripe = new Stripe(MainVariables.stripeSecretKey, {
    apiVersion: "2020-08-27",
    // Register extension as a Stripe plugin
    // https://stripe.com/docs/building-plugins#setappinfo
    appInfo: {
      name: "Cuttinboard-Firebase",
      version: "0.1",
    },
  });

  if (!stripe) {
    throw new https.HttpsError(
      "failed-precondition",
      "Stripe Api not initialized"
    );
  }

  const { uid, email } = context.auth.token;

  if (!email || !uid || !price) {
    return;
  }

  try {
    // Check if user is already a customer
    const userDocumentSnap = await firestore()
      .collection("Users")
      .doc(uid)
      .get();
    const userData = userDocumentSnap.data();
    if (!userDocumentSnap.exists || !userData) {
      throw new https.HttpsError(
        "failed-precondition",
        "The user has no main document"
      );
    }
    const { customerId, subscriptionId, name, lastName, phoneNumber, avatar } =
      userData;
    const batch = firestore().batch();

    let checkedCustomerId = customerId;
    let checkedSubId = subscriptionId;

    if (!checkedCustomerId) {
      // Create a new customer
      const customer = await stripe.customers.create({
        email,
        name: `${name} ${lastName}`,
        metadata: {
          firebaseUID: uid,
        },
        phone: phoneNumber,
      });
      checkedCustomerId = customer.id;
      batch.set(
        firestore().collection("Users").doc(uid),
        { customerId: checkedCustomerId },
        { merge: true }
      );
    }

    if (!checkedSubId) {
      // Create a new subscription
      const subscription = await stripe.subscriptions.create({
        customer: checkedCustomerId,
        items: [{ price }],
        metadata: {
          firebaseUID: uid,
        },
        trial_period_days: 30,
      });
      checkedSubId = subscription.id;
      batch.set(
        firestore().collection("Users").doc(uid),
        { subscriptionId: checkedSubId },
        { merge: true }
      );
      batch.set(firestore().collection("Organizations").doc(uid), {
        locations: 0,
        subItemId: subscription.items.data[0].id,
        subscriptionId: checkedSubId,
        customerId: checkedCustomerId,
        subscriptionStatus: subscription.status,
      });
      const expoToolsTokens = await getUserExpoTokens(uid);
      const newEmployeeToAdd = {
        id: uid,
        name,
        lastName,
        phoneNumber,
        email,
        avatar,
        isOwner: true,
        role: RoleAccessLevels.OWNER,
        expoToolsTokens,
        organizationId: uid,
      };
      batch.set(
        firestore()
          .collection("Organizations")
          .doc(uid)
          .collection("employees")
          .doc(uid),
        newEmployeeToAdd,
        { merge: true }
      );
    }

    // Users reference
    const keysRef = firestore()
      .collection("Users")
      .doc(uid)
      .collection("organizationKeys")
      .doc(uid);
    batch.set(
      keysRef,
      {
        role: RoleAccessLevels.OWNER,
        orgId: uid,
      },
      { merge: true }
    );

    await batch.commit();

    return { customerId: checkedCustomerId, subscriptionId: checkedSubId };
  } catch (error) {
    throw new https.HttpsError(
      "failed-precondition",
      (error as Error)?.message
    );
  }
});
