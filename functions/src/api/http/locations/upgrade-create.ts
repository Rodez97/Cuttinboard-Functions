import { firestore } from "firebase-admin";
import { https } from "firebase-functions";
import Stripe from "stripe";
import { MainVariables } from "../../../config";
import short from "short-uuid";
import { handleError } from "../../../services/handleError";
import { inviteEmployee } from "../../../services/inviteEmployee";
import { cuttinboardUserConverter } from "../../../models/converters/cuttinboardUserConverter";
import {
  DefaultScheduleSettings,
  ILocation,
  IOrganizationEmployee,
  RoleAccessLevels,
} from "@cuttinboard-solutions/types-helpers";

interface IUpgradeOwnerData {
  price: string;
  locationName: string;
  gm: {
    name: string;
    lastName: string;
    email: string;
  } | null;
}

export default https.onCall(async (data: IUpgradeOwnerData, context) => {
  if (!context.auth) {
    // If the user is not authenticated
    throw new https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const { price, locationName, gm } = data;

  if (typeof price !== "string" || !price) {
    // If the price is not valid then throw an error
    throw new https.HttpsError(
      "invalid-argument",
      "The function must be called with a valid price!"
    );
  }

  const { uid, email } = context.auth.token;

  if (!email) {
    // If the email or uid is not valid then throw an error
    throw new https.HttpsError(
      "invalid-argument",
      "The function must be called with a valid email!"
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
      "The stripe client could not be initialized!"
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

    if (!userData) {
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
      expand: ["items.data.price.product"],
    });

    if (!subscription) {
      // If the subscription is not created then throw an error
      throw new https.HttpsError(
        "internal",
        "The subscription could not be created!"
      );
    }

    // Get the metadata from the product of the subscription.
    // * Note: The metadata contains the limits of the subscription plan.
    const { metadata } = subscription.items.data[0].price
      .product as Stripe.Product;

    // Generate a random id for the location
    const locationId = short.generate();

    // Create the location document reference
    const locationRef = firestore().collection("Locations").doc(locationId);

    // Create the location data
    const locationMain: ILocation = {
      name: locationName,
      subscriptionStatus: subscription.status,
      storageUsed: 0,
      limits: metadata as unknown as ILocation["limits"],
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
    };

    // Set the location data
    batch.set(locationRef, locationMain, { merge: true });

    // Create initial data for the location
    const locationChecklist = await firestore()
      .collection("Templates")
      .doc("locationChecklist")
      .get();

    if (locationChecklist.exists) {
      const locationChecklistRef = firestore()
        .collection("Locations")
        .doc(locationId)
        .collection("globals")
        .doc("dailyChecklists");

      batch.set(locationChecklistRef, {
        ...locationChecklist.data(),
        locationId,
      });
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
      createdAt: new Date().getTime(),
      refPath: `Organizations/${uid}/employees/${uid}`,
    };

    // Add the new employee to the organization
    batch.set(firestore().doc(newEmployeeToAdd.refPath), newEmployeeToAdd);

    // Update the user document
    batch.update(firestore().collection("Users").doc(uid), userUpdates);

    // Commit the batch
    await batch.commit();

    // If the general manager data is provided then create the employee.
    if (gm) {
      // Create the employee
      await inviteEmployee({
        ...gm,
        locationId,
        organizationId: uid,
        role: RoleAccessLevels.GENERAL_MANAGER,
      });
    }
  } catch (error) {
    handleError(error);
  }
});
