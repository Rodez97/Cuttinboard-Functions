import { firestore } from "firebase-admin";
import { auth, logger } from "firebase-functions";
import { cuttinboardUserConverter } from "../../models/converters/cuttinboardUserConverter";
import { deleteFiles } from "../../services/deleteFiles";
import { updateUserMetadata } from "../../services/updateUserMetadata";

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
  // Reference to user document.
  const userDocRef = firestore()
    .collection("Users")
    .doc(user.uid)
    .withConverter(cuttinboardUserConverter);

  // Get the user's employee profiles.
  const employeeProfiles = await firestore()
    .collectionGroup("employees")
    .where("id", "==", user.uid)
    .get();

  // Remove the user's profile from all organizations where they are an employee and add it to the update batch.
  employeeProfiles.forEach((ep) => {
    bulkWriter.delete(ep.ref);
  });

  // Check if any 1-1 chats need to be deleted or have the user's ID removed as a member.
  const directMessageSnapshots = await firestore()
    .collection("DirectMessages")
    .where("membersList", "array-contains", user.uid)
    .get();

  directMessageSnapshots.forEach((chatSnapshot) => {
    const membersList: string[] = chatSnapshot.get("membersList");
    if (membersList.length === 1) {
      bulkWriter.delete(chatSnapshot.ref);
    } else {
      bulkWriter.update(chatSnapshot.ref, {
        membersList: firestore.FieldValue.arrayRemove(user.uid),
      });
    }
  });

  try {
    // Delete the user's global profile and all its subcollections.
    await firestore().recursiveDelete(userDocRef, bulkWriter);
  } catch (error) {
    logger.error("Error deleting user profile", error);
  }

  // Delete files from the user's storage bucket.
  await deleteFiles(`users/${user.uid}`);

  // Update the metadata for the user's deleted state.
  await updateUserMetadata(user.uid, true);
});
