import { firestore, storage } from "firebase-admin";
import * as functions from "firebase-functions";

export default functions.firestore
  .document(`/Organizations/{organizationId}/files/{drawerId}`)
  .onDelete(async (deletedDrawer, context) => {
    const { organizationId, drawerId } = context.params;
    try {
      await storage()
        .bucket()
        .deleteFiles({
          prefix: `organizations/${organizationId}/files/${drawerId}`,
        });
      // Delete the drawer's subcollections
      await firestore().recursiveDelete(deletedDrawer.ref);
    } catch (error: any) {
      functions.logger.error(error);
    }
  });
