import dayjs from "dayjs";
import { database, firestore } from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { handleError } from "../../services/handleError";

export default onSchedule("0 0 1,16 * *", async () => {
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
