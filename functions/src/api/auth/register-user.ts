import { auth, firestore } from "firebase-admin";
import { https } from "firebase-functions";
import { isFirebaseError, isError } from "../../services/errorCheck";

/**
 * Register a new user.
 */
export default https.onCall(async (data) => {
  const { email, name, lastName, password } = data;

  // Check that the all the required fields are present.
  if (!email || !name || !lastName || !password) {
    throw new https.HttpsError(
      "invalid-argument",
      "The function must be called with all the required arguments."
    );
  }
  // Lowercase the email address.
  const loweredEmail = email.toLowerCase();

  try {
    // Get a reference to the Firebase Auth instance and the "Users" collection.
    const authInstance = auth();
    const usersCollection = firestore().collection("Users");

    // Create the user.
    const cuttinboardUser = await authInstance.createUser({
      displayName: `${name} ${lastName}`,
      email: loweredEmail,
      password,
    });
    // Create the user document on firestore.
    await usersCollection.doc(cuttinboardUser.uid).set({
      name,
      lastName,
      email: loweredEmail,
    });
    // Return the user data.
    return cuttinboardUser.uid;
  } catch (error) {
    if (isFirebaseError(error)) {
      switch (error?.code) {
        case "auth/email-already-exists":
          throw new https.HttpsError(
            "already-exists",
            `A user with the email address ${loweredEmail} already exists.`
          );
        case "auth/invalid-email":
          throw new https.HttpsError(
            "invalid-argument",
            `The email address ${loweredEmail} is invalid.`
          );
        case "auth/operation-not-allowed":
          throw new https.HttpsError(
            "failed-precondition",
            "Email/password accounts are not enabled. Enable email/password accounts in the Firebase Console, under the Auth tab."
          );
        case "auth/weak-password":
          throw new https.HttpsError(
            "invalid-argument",
            "The password must be 6 characters long or more."
          );
        default:
          throw new https.HttpsError("unknown", error.message, error.code);
      }
    } else if (isError(error)) {
      throw new https.HttpsError("unknown", error.message);
    } else {
      throw new https.HttpsError("unknown", "An unknown error occurred.");
    }
  }
});
