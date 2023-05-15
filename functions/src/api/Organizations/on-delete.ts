import { firestore, storage } from "firebase-admin";
import * as functions from "firebase-functions";
import { locationConverter } from "../../models/converters/locationConverter";
import { GrpcStatus } from "firebase-admin/firestore";

export default functions.firestore
  .document("Organizations/{organizationId}")
  .onDelete(async (_, context) => {
    const { organizationId } = context.params;

    try {
      // Create a bulk writer instance
      const bulkWriter = firestore().bulkWriter();
      // Set the error handler on the bulkWriter
      bulkWriter.onWriteError((error) => {
        if (error.code === GrpcStatus.NOT_FOUND) {
          functions.logger.log(
            "Document does not exist: ",
            error.documentRef.path
          );
          return false;
        }
        if (error.failedAttempts < 10) {
          return true;
        } else {
          return false;
        }
      });

      // Delete locations and get the members and supervisors
      await deleteLocations(organizationId, bulkWriter);

      // Delete all the collections, subcollections and documents that belong to the organization.
      await firestore().recursiveDelete(_.ref, bulkWriter);

      // Delete the files from storage
      await storage()
        .bucket()
        .deleteFiles({
          prefix: `organizations/${organizationId}`,
        });
    } catch (error: any) {
      functions.logger.error(error);
      throw new functions.https.HttpsError("unknown", error.message);
    }
  });

export const deleteLocations = async (
  organizationId: string,
  bulkWriter: firestore.BulkWriter
) => {
  const locations = await firestore()
    .collection("Locations")
    .where("organizationId", "==", organizationId)
    .withConverter(locationConverter)
    .get();

  if (locations.empty) {
    return;
  }

  locations.forEach((location) => {
    bulkWriter.delete(location.ref);
  });
};
