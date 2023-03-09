import {
  IOrganizationEmployee,
  RoleAccessLevels,
} from "@cuttinboard-solutions/types-helpers";
import { firestore } from "firebase-admin";
import { https } from "firebase-functions";
import Stripe from "stripe";
import { MainVariables } from "../../config";
import { cuttinboardUserConverter } from "../../models/converters/cuttinboardUserConverter";
import { handleError } from "../../services/handleError";

export default https.onCall(async (price: string, context) => {
  if (!context.auth) {
    // If the user is not authenticated
    throw new https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  if (typeof price !== "string" || !price) {
    // If the price is not valid then throw an error
    throw new https.HttpsError(
      "invalid-argument",
      "The function must be called with a valid price!"
    );
  }

  const { uid, email } = context.auth.token;

  if (!email || !uid) {
    // If the email or uid is not valid then throw an error
    throw new https.HttpsError(
      "invalid-argument",
      "The function must be called with a valid email, uid, and price!"
    );
  }

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

  if (!stripe) {
    // If stripe is not initialized then throw an error
    throw new https.HttpsError(
      "internal",
      "The function could not be initialized!"
    );
  }

  try {
    // Check if user is already a customer
    const userDocumentSnap = await firestore()
      .collection("Users")
      .doc(uid)
      .withConverter(cuttinboardUserConverter)
      .get();

    const userData = userDocumentSnap.data();

    if (!userDocumentSnap.exists || !userData) {
      // If the user document does not exist then throw an error
      throw new https.HttpsError(
        "not-found",
        "The user document does not exist!"
      );
    }

    const { customerId, subscriptionId, name, lastName, phoneNumber, avatar } =
      userData;

    if (subscriptionId) {
      // If the user already has a subscription then throw an error
      throw new https.HttpsError(
        "already-exists",
        "The user already has a subscription!"
      );
    }

    const batch = firestore().batch();

    const userUpdates: {
      customerId?: string;
      subscriptionId?: string;
    } = {};

    if (!customerId) {
      // If the user does not have a customer ID then create one
      const customer = await stripe.customers.create({
        email,
        name: `${name} ${lastName}`,
        metadata: {
          firebaseUID: uid,
        },
        phone: phoneNumber,
      });

      if (!customer) {
        // If the customer is not created then throw an error
        throw new https.HttpsError(
          "internal",
          "The customer could not be created!"
        );
      }

      // Set the customer ID
      userUpdates.customerId = customer.id;
    } else {
      // Set the customer ID
      userUpdates.customerId = customerId;
    }

    // Create the subscription
    const subscription = await stripe.subscriptions.create({
      customer: userUpdates.customerId,
      items: [{ price }],
      metadata: {
        firebaseUID: uid,
      },
      trial_period_days: 30,
    });

    if (!subscription) {
      // If the subscription is not created then throw an error
      throw new https.HttpsError(
        "internal",
        "The subscription could not be created!"
      );
    }

    // Set the subscription ID
    userUpdates.subscriptionId = subscription.id;

    // Create the organization document with initial data
    batch.set(firestore().collection("Organizations").doc(uid), {
      locations: 0,
      subItemId: subscription.items.data[0].id,
      subscriptionStatus: subscription.status,
      limits: {
        storage: "5e+9",
      },
      ...userUpdates,
    });

    // Create the owner - employee document with initial data
    const newEmployeeToAdd: IOrganizationEmployee = {
      id: uid,
      name,
      lastName,
      phoneNumber,
      email,
      avatar,
      role: RoleAccessLevels.OWNER,
      organizationId: uid,
      createdAt: firestore.Timestamp.now().toMillis(),
      refPath: `Organizations/${uid}/employees/${uid}`,
    };

    // Add the new employee to the organization
    batch.set(
      firestore()
        .collection("Organizations")
        .doc(uid)
        .collection("employees")
        .doc(uid),
      newEmployeeToAdd
    );

    // Update the user document
    batch.update(firestore().collection("Users").doc(uid), userUpdates);

    // Commit the batch
    await batch.commit();
  } catch (error) {
    handleError(error);
  }
});
