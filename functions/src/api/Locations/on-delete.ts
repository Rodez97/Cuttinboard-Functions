import { firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { deleteFiles } from "../../services/deleteFiles";
import { GrpcStatus } from "firebase-admin/firestore";
import { ILocation } from "@rodez97/types-helpers";
import { conversationConverter } from "../../models/converters/directMessageConverter";
import { orgEmployeeConverter } from "../../models/converters/employeeConverter";
import { clearUserClaimsLocation } from "../../services/auth";
import { organizationConverter } from "../../models/converters/organizationConverter";

/**
 * Clean the location data from the organization
 */
export default functions.firestore
  .document(`/Locations/{locationId}`)
  .onDelete(async (change, context) => {
    const { locationId } = context.params;

    // Get the location data
    const { organizationId, supervisors, members } = change.data() as ILocation;

    // Initialize the updates batch
    const bulkWriter = firestore().bulkWriter();

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

    // Organization employees reference
    const employeesRef = firestore()
      .collection("Organizations")
      .doc(organizationId)
      .collection("employees")
      .withConverter(orgEmployeeConverter);

    /**
     * Remove the location from each supervisor
     */
    supervisors?.forEach((supervisor) => {
      bulkWriter.update(employeesRef.doc(supervisor), {
        supervisingLocations: firestore.FieldValue.arrayRemove(locationId),
      });
    });

    // Decrease the locations count by one and update the organization
    bulkWriter.update(
      firestore()
        .collection("Organizations")
        .doc(organizationId)
        .withConverter(organizationConverter),
      {
        locations: firestore.FieldValue.increment(-1),
      }
    );

    try {
      // Delete conversations
      await removeAllConversation(locationId, bulkWriter);

      await deleteAllScheduleDocs(locationId, bulkWriter);

      await firestore().recursiveDelete(change.ref, bulkWriter);

      await deleteFiles(`locations/${locationId}`);

      await clearUserClaimsLocation(members, locationId);
    } catch (error: any) {
      functions.logger.error(error);
      throw new functions.https.HttpsError("unknown", error.message);
    }
  });

export async function removeAllConversation(
  locationId: string, // ID of the location where the conversations take place
  bulkWriter: firestore.BulkWriter
) {
  // Get all conversations that the employee is a member of
  const conversations = await firestore()
    .collection("conversations")
    .where("locationId", "==", locationId)
    .withConverter(conversationConverter)
    .get();

  // If there are conversations where the employee is a member
  if (!conversations.empty) {
    // Loop through the conversations
    conversations.forEach((conversation) => {
      // Delete the conversation
      bulkWriter.delete(conversation.ref);
    });
  }
}

async function deleteAllScheduleDocs(
  locationId: string,
  bulkWriter: firestore.BulkWriter
) {
  const scheduleRef = firestore()
    .collection("schedule")
    .where("locationId", "==", locationId);
  const shiftsRef = firestore()
    .collection("shifts")
    .where("locationId", "==", locationId);
  const scheduleDocs = await scheduleRef.get();
  if (!scheduleDocs.empty) {
    scheduleDocs.forEach((doc) => {
      bulkWriter.delete(doc.ref);
    });
  }
  const shiftsDocs = await shiftsRef.get();
  if (!shiftsDocs.empty) {
    shiftsDocs.forEach((doc) => {
      bulkWriter.delete(doc.ref);
    });
  }
}
