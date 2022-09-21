import { FirebaseError, firestore, storage } from "firebase-admin";
import * as functions from "firebase-functions";

export default functions.firestore
  .document(`/Organizations/{organizationId}/storage/{drawerId}`)
  .onDelete(async (deletedDrawer, context) => {
    const { organizationId, drawerId } = context.params;
    const drawerData = deletedDrawer.data();
    const { locationId } = drawerData;

    if (!locationId) {
      return;
    }

    try {
      await firestore().recursiveDelete(deletedDrawer.ref);
      await storage()
        .bucket()
        .deleteFiles({
          prefix: `organizations/${organizationId}/locations/${locationId}/storage/${drawerId}`,
        });
    } catch (error) {
      const { code, message } = error as FirebaseError;
      throw new functions.https.HttpsError(
        "failed-precondition",
        JSON.stringify({ code, message })
      );
    }
  });
