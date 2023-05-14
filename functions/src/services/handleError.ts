import * as functions from "firebase-functions";
import { isError, isFirebaseError } from "./errorCheck";

// Handles errors thrown by the functions.
export function handleError(error: any) {
  // Handle different types of errors.
  if (isFirebaseError(error)) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      error.message,
      error.code
    );
  } else if (isError(error)) {
    throw new functions.https.HttpsError("unknown", error.message);
  } else {
    functions.logger.error(error);
    throw new functions.https.HttpsError("unknown", error.message);
  }
}
