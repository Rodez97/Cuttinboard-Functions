import { database } from "firebase-admin";
import { logger } from "firebase-functions";

export const updateUserMetadata = async ({
  uid,
  refreshTime,
  deleteAccount,
}: {
  uid: string;
  refreshTime?: number;
  deleteAccount?: boolean;
}) => {
  try {
    // Update the database in real time to notify the client to force the update.
    const metadataRef = database().ref(`users/${uid}`);
    // Set the update time to the current UTC timestamp.
    // This will be captured on the client to force a token refresh.

    const update: { [key: string]: number | boolean } = {
      ["/notifications/claims"]: refreshTime
        ? refreshTime
        : new Date().getTime(),
    };

    if (deleteAccount) {
      update["/metadata/deleteAccount"] = true;
    }

    await metadataRef.update(update);
  } catch (error: any) {
    logger.error(error);
  }
};
