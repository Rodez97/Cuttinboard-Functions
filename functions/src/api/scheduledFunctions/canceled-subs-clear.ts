import dayjs from "dayjs";
import { firestore } from "firebase-admin";
import { pubsub } from "firebase-functions";
import { deleteOrganization } from "../../services/organization";

export default pubsub
  .schedule("0 0 1 * *")
  .timeZone("America/New_York") // Users can choose timezone - default is America/Los_Angeles
  .onRun(async (context) => {
    const cancelDate = dayjs().subtract(15, "days").toDate();
    // Get organizations canceled from 15 days or more
    const cancelledLocSnap = await firestore()
      .collection("Organizations")
      .where("subscriptionStatus", "==", "canceled")
      .where("cancellationDate", "<=", cancelDate)
      .get();

    for await (const org of cancelledLocSnap.docs) {
      await deleteOrganization(org.id);
    }
  });
