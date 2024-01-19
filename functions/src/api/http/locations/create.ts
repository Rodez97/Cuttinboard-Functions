import { firestore } from "firebase-admin";
import short from "short-uuid";
import Stripe from "stripe";
import { MainVariables } from "../../../config";
import { inviteEmployee } from "../../../services/inviteEmployee";
import {
  DefaultScheduleSettings,
  ILocation,
  ILocationLimits,
  RoleAccessLevels,
} from "@rodez97/types-helpers";
import { cuttinboardUserConverter } from "../../../models/converters/cuttinboardUserConverter";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { organizationConverter } from "../../../models/converters/organizationConverter";
import { GeneralManagerSchema } from "../../../services/validationSchemes";
import { ICreateLocationData } from "../../../models/ICreateLocationData";

// Initialize the stripe client
const stripe = new Stripe(MainVariables.stripeSecretKey, {
  apiVersion: "2023-10-16",
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

    // Checking that the user is authenticated.
    if (!auth) {
      // Throwing an HttpsError so that the client gets the error details.
      throw new HttpsError(
        "failed-precondition",
        "The function must be called while authenticated!"
      );
    }

    // Location creation data
    const { location, generalManager } = data;

    const { uid } = auth.token;

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

    const { customerId, subscriptionId } = userDocument;

    if (!customerId || !subscriptionId) {
      // If the user does not have a customer id or subscription id then return an error.
      throw new HttpsError(
        "failed-precondition",
        "The user does not have a subscription!"
      );
    }

    const batch = firestore().batch();

    try {
      // Get the subscription
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["items.data.price.product"],
      });

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
        subscriptionStatus: subscription.status as any,
        storageUsed: 0,
        limits: metadata as unknown as ILocationLimits,
        organizationId: uid,
        subscriptionId,
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

      // Increment the locations count in the organization document
      const organizationRef = firestore()
        .collection("Organizations")
        .doc(uid)
        .withConverter(organizationConverter);
      batch.update(organizationRef, {
        locations: firestore.FieldValue.increment(1),
      });

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

      // Return the data to the client.
      return { customerId, subscriptionId, organizationId: uid };
    } catch (error: any) {
      logger.error(error);
      throw new HttpsError("unknown", error.message);
    }
  }
);
