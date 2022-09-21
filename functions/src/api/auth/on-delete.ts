import { database, FirebaseError, firestore, storage } from "firebase-admin";
import { auth, https } from "firebase-functions";

export default auth.user().onDelete(async (user) => {
  // Initialize the update batch.
  const batch = firestore().batch();
  // Reference to user document.
  const userDocRef = firestore().collection("Users").doc(user.uid);
  // Delete the user's profile for each location to which it belongs and add it to the batch of updates (batch)
  const locationsEmpRef = await firestore()
    .collectionGroup("employees")
    .where("id", "==", user.uid)
    .get();
  for (const { ref } of locationsEmpRef.docs) {
    // Reference to the employee document of the location
    batch.delete(ref);
  }

  try {
    // Execute the batch of operations to delete the profiles in the different locations
    await batch.commit();
    // Delete the user's global profile and all its subcollections
    await firestore().recursiveDelete(userDocRef);
    // Clear user resources from storage
    await storage()
      .bucket()
      .deleteFiles({
        prefix: `users/${user.uid}`,
      });
    // Update the database in real time to notify the client to force the update.
    const metadataRef = database().ref(`users/${user.uid}/metadata`);
    // Set the update time to the current UTC timestamp.
    // This will be captured on the client to force a token refresh.
    await metadataRef.set({
      refreshTime: new Date().getTime(),
      deleteAccount: true,
    });
  } catch (error) {
    const { code, message } = error as FirebaseError;
    throw new https.HttpsError(
      "failed-precondition",
      JSON.stringify({ code, message })
    );
  }
});
