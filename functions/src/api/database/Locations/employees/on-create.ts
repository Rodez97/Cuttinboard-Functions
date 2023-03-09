/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { IEmployee, PrivacyLevel } from "@cuttinboard-solutions/types-helpers";
import { firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { handleError } from "../../../../services/handleError";

// Update the conversations when a new employee is created.
export default functions.firestore
  .document("/Locations/{locationId}/employees/{employeeId}")
  .onCreate(async (snapshot, context) => {
    // Destructure the employeeId from the context params
    const { employeeId, locationId } = context.params;

    try {
      // Get the employee data and destructure the locations, role, and locationsList properties
      const { positions } = snapshot.data() as IEmployee;

      // Create a new batch
      const bulkWriter = firestore().bulkWriter();

      // Add the employee as member to the location's public conversations
      await addToPublicConversations(locationId, employeeId, bulkWriter);

      // Add to positional conversations
      if (positions && positions.length > 0) {
        await addToPositionalConversations(
          locationId,
          employeeId,
          positions,
          bulkWriter
        );
      }

      // Commit the batch
      await bulkWriter.close();
    } catch (error) {
      // Handle the error
      handleError(error);
    }
  });

export async function addToPublicConversations(
  locationId: string,
  employeeId: string,
  batch: firestore.BulkWriter
) {
  // Get the public conversations
  const publicConversations = await firestore()
    .collection("Locations")
    .doc(locationId)
    .collection("conversations")
    .where("privacyLevel", "==", PrivacyLevel.PUBLIC)
    .get();

  // If there are public conversations
  if (!publicConversations.empty) {
    // Loop through the public conversations
    publicConversations.forEach((conversation) => {
      // Add the employee to the conversation members
      batch.update(conversation.ref, {
        members: firestore.FieldValue.arrayUnion(employeeId),
      });
    });
  }
}

export async function addToPositionalConversations(
  locationId: string,
  employeeId: string,
  positions: string[],
  batch: firestore.BulkWriter
) {
  // Get the positional conversations
  const positionalConversations = await firestore()
    .collection("Locations")
    .doc(locationId)
    .collection("conversations")
    .where("privacyLevel", "==", PrivacyLevel.POSITIONS)
    .where("position", "in", positions)
    .get();

  // If there are positional conversations
  if (!positionalConversations.empty) {
    // Loop through the positional conversations
    positionalConversations.forEach((conversation) => {
      // Add the employee to the conversation members
      batch.update(conversation.ref, {
        members: firestore.FieldValue.arrayUnion(employeeId),
      });
    });
  }
}
