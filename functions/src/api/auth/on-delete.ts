import { firestore } from "firebase-admin";
import { auth, logger } from "firebase-functions";
import { directMessageConverter } from "../../models/converters/directMessageConverter";
import { deleteFiles } from "../../services/deleteFiles";
import { updateUserMetadata } from "../../services/updateUserMetadata";
import Stripe from "stripe";
import { MainVariables } from "../../config";
import { locationConverter } from "../../models/converters/locationConverter";
import { employeeDocConverter } from "../../models/converters/employeeConverter";

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

const deleteUserProfile = async (
  userId: string,
  bulkWriter: firestore.BulkWriter
) => {
  try {
    // Delete the user's global profile and all its subcollections.
    await firestore().recursiveDelete(
      firestore().collection("Users").doc(userId),
      bulkWriter
    );
  } catch (error: any) {
    logger.error(error);
  }
};

/**
 * This function deletes a Stripe customer with a given email address.
 * @param {string} email - The email of the Stripe customer that needs to be deleted.
 */
const deleteStripeCustomer = async (email: string) => {
  try {
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

    const customer = await stripe.customers.list({
      limit: 1,
      email,
    });

    if (customer.data.length > 0) {
      await stripe.customers.del(customer.data[0].id);
    }
  } catch (error: any) {
    logger.error(error);
  }
};

/**
 * This function deletes a user from a direct message chat or deletes the chat entirely if it was a 1-1
 * chat.
 * @param {string} userId - a string representing the ID of the user whose direct messages need to be
 * modified or deleted.
 * @param bulkWriter - A Firestore BulkWriter object, which allows for efficient batched writes to
 * Firestore.
 */
const deleteDMMember = async (
  userId: string,
  bulkWriter: firestore.BulkWriter
) => {
  try {
    const directMessageSnapshots = await firestore()
      .collection("directMessages")
      .where(`members.${userId}._id`, "==", userId)
      .withConverter(directMessageConverter)
      .get();

    directMessageSnapshots.forEach((chatSnapshot) => {
      const { onlyOneMember } = chatSnapshot.data();
      if (onlyOneMember) {
        bulkWriter.delete(chatSnapshot.ref);
      } else {
        bulkWriter.set(
          chatSnapshot.ref,
          {
            members: {
              [userId]: firestore.FieldValue.delete(),
            },
            onlyOneMember: true,
          },
          { merge: true }
        );
      }
    });
  } catch (error: any) {
    logger.error(error);
  }
};

const deleteEmployeeLocationProfiles = async (
  userId: string,
  bulkWriter: firestore.BulkWriter
) => {
  try {
    // Get the locations where the user is an employee
    const locations = await firestore()
      .collection("Locations")
      .where(`members`, "array-contains", userId)
      .withConverter(locationConverter)
      .get();

    if (locations.size > 0) {
      locations.forEach((ep) => {
        const employeesDocRef = ep.ref
          .collection("employees")
          .doc("employeesDocument")
          .withConverter(employeeDocConverter);
        // Update the employee profile on the locations
        bulkWriter.update(
          employeesDocRef,
          `employees.${userId}`,
          firestore.FieldValue.delete()
        );
      });
    }
  } catch (error: any) {
    logger.error(error);
  }
};

const deleteEmployeeOrganizationsProfiles = async (
  userId: string,
  bulkWriter: firestore.BulkWriter
) => {
  try {
    // Get the locations where the user is an employee
    const employeeOrganizationProfiles = await firestore()
      .collectionGroup("employees")
      .where(`id`, "==", userId)
      .get();

    if (employeeOrganizationProfiles.size > 0) {
      employeeOrganizationProfiles.forEach((ep) => {
        bulkWriter.delete(ep.ref);
      });
    }
  } catch (error: any) {
    logger.error(error);
  }
};
