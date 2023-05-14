import dayjs from "dayjs";
import { database, firestore } from "firebase-admin";
import { pubsub } from "firebase-functions";
import { handleError } from "../../services/handleError";

export default pubsub
  .schedule("0 0 1,16 * *")
  .timeZone("America/New_York") // Users can choose timezone - default is America/Los_Angeles
  .onRun(async () => {
    // ! Clean the organizations that have been deleted for more than 15 days
    const cancelDate = dayjs().subtract(15, "days").toDate();
    //  Get organizations canceled from 15 days or more
    const cancelledOrgsSnap = await firestore()
      .collection("Organizations")
      .where("subscriptionStatus", "==", "canceled")
      .where("cancellationDate", "<=", cancelDate)
      .get();
    // Initialize the batch of deletions
    const batch = firestore().batch();
    // Loop through the organizations
    cancelledOrgsSnap.forEach((org) => {
      batch.delete(org.ref);
    });

    // ! Delete the users that have been deleted from realtime database (deleteAccount: true)
    const deletedUsers = await database()
      .ref("users")
      .orderByChild("metadata/deleteAccount")
      .equalTo(true)
      .get();
    const updates: { [key: string]: null } = {};
    deletedUsers.forEach((user) => {
      const uid = user.key;
      updates[`users/${uid}`] = null;
    });

    try {
      // Commit the batch of deletions
      await batch.commit();
      // Delete the users from realtime database
      await database().ref().update(updates);
    } catch (error) {
      handleError(error);
    }
  });
