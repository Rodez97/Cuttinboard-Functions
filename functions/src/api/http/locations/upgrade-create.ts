import { firestore } from "firebase-admin";
import Stripe from "stripe";
import { MainVariables } from "../../../config";
import short from "short-uuid";
import { inviteEmployee } from "../../../services/inviteEmployee";
import { cuttinboardUserConverter } from "../../../models/converters/cuttinboardUserConverter";
import {
  DefaultScheduleSettings,
  ICuttinboardUser,
  ILocation,
  ILocationLimits,
  IOrganizationEmployee,
  RoleAccessLevels,
} from "@cuttinboard-solutions/types-helpers";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { PartialWithFieldValue } from "firebase-admin/firestore";
import { organizationConverter } from "../../../models/converters/organizationConverter";
import { ICreateLocationData } from "../../../models/ICreateLocationData";
import { GeneralManagerSchema } from "../../../services/validationSchemes";
import { logger } from "firebase-functions";

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

export default onCall<ICreateLocationData>(
  { cors: [/cuttinboard/] },
  async (request) => {
    const { auth, data } = request;

    if (!auth || !auth.token || !auth.token.email) {
      // If the user is not authenticated
      throw new HttpsError(
        "unauthenticated",
        "The function must be called while authenticated."
      );
    }

    // Location creation data
    const { location, generalManager } = data;

    const { uid, email } = auth.token;

    if (!location || !location.name) {
      // If the required data is not provided then return an error.
      throw new HttpsError(
        "invalid-argument",
        "The function must be called with valid data!"
      );
    }

    // Get user data
    const userDocument = (
      await firestore()
        .collection("Users")
        .doc(uid)
        .withConverter(cuttinboardUserConverter)
        .get()
    ).data();

    if (!userDocument) {
      // If the user does not exist then return an error.
      throw new HttpsError("not-found", "The user document does not exist!");
    }

    const { customerId, subscriptionId, name, lastName, phoneNumber, avatar } =
      userDocument;

    if (subscriptionId) {
      // If the user already has a subscription then throw an error
      throw new HttpsError(
        "already-exists",
        "The user already has a subscription!"
      );
    }

    const batch = firestore().batch();

    try {
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
          throw new HttpsError(
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

      let promotion_code: string | undefined;

      if (data.promo) {
        // If the user has a promo code then get the promo code
        const promo = await stripe.promotionCodes.list({
          code: data.promo,
          limit: 1,
        });

        if (promo.data.length > 0) {
          promotion_code = promo.data[0].id;
        } else {
          // If the promo code does not exist then throw an error
          throw new HttpsError(
            "not-found",
            "The promo code does not exist or has expired!"
          );
        }
      }

      // Create the subscription
      const subscription = await stripe.subscriptions.create({
        customer: userUpdates.customerId,
        items: [{ price: MainVariables.stripePriceId, quantity: 1 }],
        metadata: {
          firebaseUID: uid,
        },
        trial_period_days: 30,
        expand: ["items.data.price.product"],
        promotion_code,
      });

      if (!subscription) {
        // If the subscription is not created then throw an error
        throw new HttpsError(
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
        ...location,
        subscriptionStatus: subscription.status,
        storageUsed: 0,
        limits: metadata as unknown as ILocationLimits,
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
            storage: "5e+9",
          },
          storageUsed: 0,
        }
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
      if (generalManager) {
        // Validate the general manager data
        const validData = await GeneralManagerSchema.validate(generalManager);

        // Create the employee
        await inviteEmployee({
          ...validData,
          locationId,
          organizationId: uid,
          role: RoleAccessLevels.GENERAL_MANAGER,
        });
      }
    } catch (error: any) {
      logger.error(error);
      throw new HttpsError("unknown", error.message);
    }
  }
);
