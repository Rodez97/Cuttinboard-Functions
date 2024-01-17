import { auth, firestore } from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v1";
import { PartialWithFieldValue } from "firebase-admin/firestore";
import {
  DefaultScheduleSettings,
  ICuttinboardUser,
  ILocation,
  ILocationLimits,
  IOrganizationEmployee,
  RoleAccessLevels,
  SubTier,
} from "@cuttinboard-solutions/types-helpers";
import Stripe from "stripe";
import { MainVariables } from "../../../config";
import short from "short-uuid";
import { organizationConverter } from "../../../models/converters/organizationConverter";
import { sendWelcomeEmail } from "../../../services/emails";

// Initialize Stripe
const stripe = new Stripe(MainVariables.stripeSecretKey, {
  apiVersion: "2022-11-15",
  // Register extension as a Stripe plugin
  // https://stripe.com/docs/building-plugins#setappinfo
  appInfo: {
    name: "Cuttinboard-Firebase",
    version: "0.1",
  },
});

/**
 * Register a new user.
 */
export default onRequest(
  { cors: [/cuttinboard/] },
  async (request, response) => {
    const { email, name, lastName, locationName, priceId, promo } =
      request.body;

    // Check that the all the required fields are present.
    if (!email || !name || !lastName || !locationName || !priceId) {
      response.status(400).send({
        message: "The function must be called with all the required arguments.",
      });

      return;
    }

    try {
      // Lowercase the email address.
      const loweredEmail = email.toLowerCase();

      // Create the user.
      const { cuttinboardUser, password } = await createAccount(
        loweredEmail,
        name,
        lastName
      );

      // Create the subscription.
      await createPlanSubscription(
        cuttinboardUser.uid,
        name,
        lastName,
        loweredEmail,
        priceId,
        locationName,
        promo
      );

      await sendWelcomeEmail(loweredEmail, name, 12, {
        NAME: name,
        LOCATIONNAME: locationName,
        PASSWORD: password,
      });

      // Return the user data.
      response.status(200).send({
        uid: cuttinboardUser.uid,
        password,
      });
    } catch (error: any) {
      logger.error(error);
      response.status(500).send({
        message: error.message,
      });
      return;
    }
  }
);

const createAccount = async (email: string, name: string, lastName: string) => {
  // Lowercase the email address.
  const loweredEmail = email.toLowerCase();

  // Get a reference to the Firebase Auth instance and the "Users" collection.
  const authInstance = auth();
  const usersCollection = firestore().collection("Users");

  // Generate a random password.
  const password = Math.random().toString(36).slice(-8);

  // Create the user.
  const cuttinboardUser = await authInstance.createUser({
    displayName: `${name} ${lastName}`,
    email: loweredEmail,
    password,
    emailVerified: true,
  });
  // Create the user document on firestore.
  await usersCollection.doc(cuttinboardUser.uid).set({
    name,
    lastName,
    email: loweredEmail,
  });

  return { cuttinboardUser, password };
};

const createPlanSubscription = async (
  uid: string,
  name: string,
  lastName: string,
  email: string,
  price: string,
  locationName: string,
  promo?: string
) => {
  const userUpdates: PartialWithFieldValue<ICuttinboardUser> = {};

  // Create the customer.
  // If the user does not have a customer ID then create one
  const customer = await stripe.customers.create({
    email,
    name: `${name} ${lastName}`,
    metadata: {
      firebaseUID: uid,
    },
  });

  if (!customer) {
    // If the customer is not created then throw an error
    throw new Error("Failed to create customer");
  }

  // Set the customer ID
  userUpdates.customerId = customer.id;

  // Check the promo code
  let promotion_code: string | undefined;

  if (promo) {
    // If the user has a promo code then get the promo code
    const promotion = await stripe.promotionCodes.list({
      code: promo,
      limit: 1,
    });

    if (promotion.data.length > 0) {
      promotion_code = promotion.data[0].id;
    } else {
      // If the promo code does not exist then throw an error
      throw new Error("The promo code does not exist or has expired!");
    }
  }

  // Create the subscription
  const subscription = await stripe.subscriptions.create({
    customer: userUpdates.customerId,
    items: [{ price: price ?? MainVariables.stripePriceId, quantity: 1 }],
    metadata: {
      firebaseUID: uid,
    },
    trial_period_days: 30,
    expand: ["items.data.price.product"],
    promotion_code,
  });

  if (!subscription) {
    // If the subscription is not created then throw an error
    throw new Error("The subscription could not be created!");
  }

  // Get the metadata from the product of the subscription.
  // * Note: The metadata contains the limits of the subscription plan.
  const { metadata } = subscription.items.data[0].price
    .product as Stripe.Product;

  // Generate a random id for the location
  const locationId = short.generate();

  // Create the location document reference
  const locationRef = firestore().collection("Locations").doc(locationId);

  const tier = metadata.tier as SubTier;
  const limits: ILocationLimits = {
    employees: metadata.employees as unknown as number,
    storage: metadata.storage,
  };

  // Create the location data
  const locationMain: ILocation = {
    name: locationName,
    subscriptionStatus: subscription.status,
    storageUsed: 0,
    limits,
    organizationId: uid,
    subscriptionId: subscription.id,
    subItemId: subscription.items.data[0].id,
    supervisors: [],
    members: [],
    id: locationId,
    createdAt: new Date().getTime(),
    refPath: locationRef.path,
    settings: {
      positions: [],
      schedule: DefaultScheduleSettings,
    },
    tier,
  };

  const batch = firestore().batch();

  // Set the location data
  batch.set(locationRef, locationMain, { merge: true });

  //   // Create initial data for the location
  //   const locationChecklist = await firestore()
  //     .collection("Templates")
  //     .doc("locationChecklist")
  //     .get();

  //   if (locationChecklist.exists) {
  //     const locationChecklistRef = firestore()
  //       .collection("Locations")
  //       .doc(locationId)
  //       .collection("globals")
  //       .doc("dailyChecklists");

  //     batch.set(locationChecklistRef, {
  //       ...locationChecklist.data(),
  //       locationId,
  //     });
  //   }

  // Set the subscription ID
  userUpdates.subscriptionId = subscription.id;

  // Create the organization document with initial data
  batch.create(
    firestore()
      .collection("Organizations")
      .doc(uid)
      .withConverter(organizationConverter),
    {
      customerId: userUpdates.customerId,
      subscriptionId: userUpdates.subscriptionId,
      locations: 1,
      subItemId: subscription.items.data[0].id,
      subscriptionStatus: subscription.status,
      limits: {
        storage: metadata.storage,
      },
      storageUsed: 0,
      tier,
    }
  );

  // Create the owner - employee document with initial data
  const newEmployeeToAdd: IOrganizationEmployee = {
    id: uid,
    name,
    lastName,
    email,
    role: RoleAccessLevels.OWNER,
    organizationId: uid,
    createdAt: new Date().getTime(),
    refPath: `Organizations/${uid}/employees/${uid}`,
  };

  // Add the new employee to the organization
  batch.set(firestore().doc(newEmployeeToAdd.refPath), newEmployeeToAdd);

  // Update the user document
  batch.update(firestore().collection("Users").doc(uid), userUpdates);

  // Commit the batch
  await batch.commit();
};
