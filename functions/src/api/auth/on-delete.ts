import { firestore } from "firebase-admin";
import { auth, logger } from "firebase-functions";
import { deleteFiles } from "../../services/deleteFiles";
import { updateUserMetadata } from "../../services/updateUserMetadata";
import Stripe from "stripe";
import {
  employeeDocConverter,
  orgEmployeeConverter,
} from "../../models/converters/employeeConverter";
import { locationConverter } from "../../models/converters/locationConverter";

/**
 * When a user is deleted, delete their data from the locations and organizations
 * they are associated with.
 * - Remove the user's profile from the organization's employee collection.
 * - Check if any 1-1 chats need to be deleted or have the user's ID removed as a member.
 * - Delete the user's global profile and all its subcollections.
 * - Delete the user's files from storage.
 * - Update the metadata for the user's deleted state.
 */
export default auth.user().onDelete(async (user) => {
  // Initialize the update batch.
  const bulkWriter = firestore().bulkWriter();

  // Delete the user's profile from locations collection.
  await deleteEmployeeLocationProfiles(user.uid, bulkWriter);

  // Delete the user's profile from organizations collection.
  await deleteEmployeeOrganizationsProfiles(user.uid, bulkWriter);

  // Clean up the user's direct messages.
  await deleteDMMember(user.uid, bulkWriter);

  // Delete the user's global profile and all its subcollections.
  await deleteUserProfile(user.uid, bulkWriter);

  if (user.email) {
    // Delete stripe customer
    await deleteStripeCustomer(user.email);
  }

  // Delete files from the user's storage bucket.
  await deleteFiles(`users/${user.uid}`);

  // Update the metadata for the user's deleted state.
  await updateUserMetadata({
    uid: user.uid,
    deleteAccount: true,
  });
});

/**
 * This function deletes a Stripe customer with a given email address.
 * @param {string} email - The email of the Stripe customer that needs to be deleted.
 */
const deleteStripeCustomer = async (email: string) => {
  try {
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

    // Get the customer with the given email address.
    const customer = await stripe.customers.list({
      limit: 1,
      email,
    });

    // If the customer exists, delete it.
    if (customer.data.length > 0) {
      await stripe.customers.del(customer.data[0].id);
    }
  } catch (error: any) {
    logger.error(error);
  }
};

/**
 * Deletes a member from direct messages.
 * @param userId - The ID of the user to delete from direct messages.
 * @param bulkWriter - The Firestore BulkWriter instance.
 * @throws If there is an error while deleting the member.
 */
const deleteDMMember = async (
  userId: string,
  bulkWriter: firestore.BulkWriter
): Promise<void> => {
  try {
    // Get all direct messages where the user is a member.
    const directMessageSnapshots = await firestore()
      .collection("directMessages")
      .where(`members.${userId}._id`, "==", userId)
      .get();

    directMessageSnapshots.forEach((chatSnapshot) => {
      const { onlyOneMember } = chatSnapshot.data();
      const dmRef = chatSnapshot.ref;
      if (onlyOneMember) {
        // If there is only one member in the direct message, delete it.
        bulkWriter.delete(dmRef);
      } else {
        // Otherwise, remove the user from the direct message.
        bulkWriter.update(dmRef, {
          onlyOneMember: true,
          [`members.${userId}`]: firestore.FieldValue.delete(),
        });
      }
    });
  } catch (error: any) {
    logger.error(error);
    throw new Error("Failed to delete member from direct messages.");
  }
};

const deleteEmployeeLocationProfiles = async (
  userId: string,
  bulkWriter: firestore.BulkWriter
) => {
  const query = firestore()
    .collection("Locations")
    .where("members", "array-contains", userId)
    .withConverter(locationConverter);

  const locations = await query.get();

  if (locations.empty) {
    // If the user is not an employee of any location, return
    return;
  }

  locations.forEach((location) => {
    const employeesDocRef = location.ref
      .collection("employees")
      .doc("employeesDocument")
      .withConverter(employeeDocConverter);
    // Delete the employee from the location's employees document
    bulkWriter.update(
      employeesDocRef,
      `employees.${userId}`,
      firestore.FieldValue.delete()
    );
  });
};

const deleteEmployeeOrganizationsProfiles = async (
  userId: string,
  bulkWriter: firestore.BulkWriter
) => {
  const query = firestore()
    .collectionGroup("employees")
    .where("id", "==", userId)
    .withConverter(orgEmployeeConverter);

  const organizationsEmployees = await query.get();

  if (organizationsEmployees.empty) {
    // If the user is not an employee of any organization, return
    return;
  }

  organizationsEmployees.forEach((organizationEmp) => {
    // Delete the employee from the organization's employees collection
    bulkWriter.delete(organizationEmp.ref);
  });
};

/**
 * Deletes a user's profile and all its subcollections.
 * @param userId The ID of the user to delete.
 * @param bulkWriter The Firestore BulkWriter instance.
 */
const deleteUserProfile = async (
  userId: string,
  bulkWriter: firestore.BulkWriter
) => {
  try {
    await firestore().recursiveDelete(
      firestore().collection("Users").doc(userId),
      bulkWriter
    );
  } catch (error: any) {
    logger.error(error);
  }
};
