import { firestore, storage } from "firebase-admin";
import * as functions from "firebase-functions";
import { locationConverter } from "../../models/converters/locationConverter";
import { deleteSubcollections } from "../../services/deleteSubcollections";

export default functions.firestore
  .document("Organizations/{organizationId}")
  .onDelete(async (_, context) => {
    const { organizationId } = context.params;

    try {
      // Delete locations and get the members and supervisors
      await deleteLocAndGetMembers(organizationId);

      // Delete all the collections, subcollections and documents that belong to the organization.
      await deleteSubcollections(_.ref);

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

export const deleteLocAndGetMembers = async (organizationId: string) => {
  const locations = await firestore()
    .collection("Locations")
    .where("organizationId", "==", organizationId)
    .withConverter(locationConverter)
    .get();

  if (locations.empty) {
    return;
  }

  const bulkWriter = firestore().bulkWriter();

  locations.forEach((location) => {
    bulkWriter.delete(location.ref);
  });

  // Commit the batch
  await bulkWriter.close();
};
