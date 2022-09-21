import { auth, FirebaseError, firestore } from "firebase-admin";
import { https } from "firebase-functions";

export default https.onCall(async (data) => {
  const { email, name, lastName, password } = data;

  // El parámetro data debe ser de tipo string y debe contener un valor
  if (!email || !name || !lastName || !password) {
    throw new https.HttpsError(
      "invalid-argument",
      "The function must be called with a valid email, name, lastName and password!"
    );
  }

  try {
    const cuttinboardUser = await auth().createUser({
      displayName: name,
      email,
      password,
    });
    // Create the user document on firestore
    await firestore()
      .collection("Users")
      .doc(cuttinboardUser.uid)
      .set({ name, lastName, email });

    return cuttinboardUser.uid;
  } catch (error) {
    const { code, message } = error as FirebaseError;
    throw new https.HttpsError(
      "failed-precondition",
      JSON.stringify({ code, message })
    );
  }
});
