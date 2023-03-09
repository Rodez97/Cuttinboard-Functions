import { database } from "firebase-admin";
import { handleError } from "./handleError";

export const updateUserMetadata = async (
  uid: string,
  deleteAccount?: boolean
) => {
  try {
    // Update the database in real time to notify the client to force the update.
    const metadataRef = database().ref(`users/${uid}/metadata`);
    // Set the update time to the current UTC timestamp.
    // This will be captured on the client to force a token refresh.

    const update: {
      refreshTime: number;
      deleteAccount?: boolean;
    } = {
      refreshTime: new Date().getTime(),
    };

    if (deleteAccount) {
      update.deleteAccount = deleteAccount;
    }

    await metadataRef.update(update);
  } catch (error) {
    handleError(error);
  }
};
