import { auth, firestore } from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v1";

interface RegisterUserRequest {
  email: string;
  name: string;
  lastName: string;
  password: string;
}

/**
 * Register a new user.
 */
export default onCall<RegisterUserRequest>({ cors: true }, async (data) => {
  const { email, name, lastName, password } = data.data;

  // Check that the all the required fields are present.
  if (!email || !name || !lastName || !password) {
    throw new HttpsError(
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
  } catch (error: any) {
    logger.error(error);
    throw new HttpsError("failed-precondition", error.message);
  }
});
