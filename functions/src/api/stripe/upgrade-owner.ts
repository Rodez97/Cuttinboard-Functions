import {
  ICuttinboardUser,
  IOrganizationEmployee,
  RoleAccessLevels,
} from "@rodez97/types-helpers";
import { firestore } from "firebase-admin";
import Stripe from "stripe";
import { cuttinboardUserConverter } from "../../models/converters/cuttinboardUserConverter";
import { handleError } from "../../services/handleError";
import { PartialWithFieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { organizationConverter } from "../../models/converters/organizationConverter";

export default onCall({ cors: true }, async (request) => {
  const { auth } = request;

  if (!auth) {
    // If the user is not authenticated
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const { uid, email } = auth.token;

  if (!email || !uid) {
    // If the email or uid is not valid then throw an error
    throw new HttpsError(
      "invalid-argument",
      "The function must be called with a valid email, uid, and price!"
    );
  }

  // Initialize Stripe
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16",
    // Register extension as a Stripe plugin
    // https://stripe.com/docs/building-plugins#setappinfo
    appInfo: {
      name: "Cuttinboard-Firebase",
      version: "0.1",
    },
  });

  if (!stripe) {
    // If stripe is not initialized then throw an error
    throw new HttpsError("internal", "The function could not be initialized!");
  }

  const userDocumentRef = firestore()
    .collection("Users")
    .doc(uid)
    .withConverter(cuttinboardUserConverter);

  try {
    // Check if user is already a customer
    const userDocumentSnap = await userDocumentRef.get();

    const userData = userDocumentSnap.data();

    if (!userData) {
      // If the user document does not exist then throw an error
      throw new HttpsError("not-found", "The user document does not exist!");
    }

    const { customerId, subscriptionId, name, lastName, phoneNumber, avatar } =
      userData;

    if (subscriptionId) {
      // If the user already has a subscription then throw an error
      throw new HttpsError(
        "already-exists",
        "The user already has a subscription!"
      );
    }

    const batch = firestore().batch();

    const userUpdates: PartialWithFieldValue<ICuttinboardUser> = {};

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
        throw new HttpsError("internal", "The customer could not be created!");
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
      items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 0 }],
      metadata: {
        firebaseUID: uid,
      },
      trial_period_days: 30,
    });

    if (!subscription) {
      // If the subscription is not created then throw an error
      throw new HttpsError(
        "internal",
        "The subscription could not be created!"
      );
    }

    // Set the subscription ID
    userUpdates.subscriptionId = subscription.id;

    // Create the organization document with initial data
    batch.set(
      firestore()
        .collection("Organizations")
        .doc(uid)
        .withConverter(organizationConverter),
      {
        customerId: userUpdates.customerId,
        subscriptionId: userUpdates.subscriptionId,
        locations: 0,
        subItemId: subscription.items.data[0].id,
        subscriptionStatus: subscription.status as any,
        limits: {
          storage: "5e+9",
        },
      },
      { merge: true }
    );

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
