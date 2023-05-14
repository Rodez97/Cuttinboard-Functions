import { firestore, storage } from "firebase-admin";
import * as functions from "firebase-functions";

export default functions.firestore
  .document(`/Locations/{locationId}/files/{drawerId}`)
  .onDelete(async (data, context) => {
    const { locationId, drawerId } = context.params;
    try {
      await storage()
        .bucket()
        .deleteFiles({
          prefix: `locations/${locationId}/files/${drawerId}`,
        });
      // Delete the drawer's subcollections
      await firestore().recursiveDelete(data.ref);
    } catch (error) {
      functions.logger.error(error);
    }
  });
