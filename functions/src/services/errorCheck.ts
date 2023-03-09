import { FirebaseError } from "firebase-admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isFirebaseError(error: any): error is FirebaseError {
  return (
    typeof error.code === "string" &&
    typeof error.message === "string" &&
    typeof error.name === "string"
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isError(error: any): error is Error {
  return typeof error.message === "string";
}
