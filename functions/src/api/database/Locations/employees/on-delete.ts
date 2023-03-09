import {
  IBoard,
  IConversation,
  IEmployee,
  PrivacyLevel,
  RoleAccessLevels,
} from "@cuttinboard-solutions/types-helpers";
import { database, firestore, storage } from "firebase-admin";
import * as functions from "firebase-functions";
import { BOARDS } from "../../../../config";
import { clearUserClaims } from "../../../../services/auth";
import { handleError } from "../../../../services/handleError";

export default functions.firestore
  .document("/Locations/{locationId}/employees/{employeeId}")
  .onDelete(async (snapshot, context) => {
    // Get the organization ID and employee ID from the function's parameters
    const { locationId, employeeId } = context.params;
    // Get the employee's data from the snapshot
    const { organizationId, role } = snapshot.data() as IEmployee;

    try {
      // Create a batch to group all the updates
      const bulkWriter = firestore().bulkWriter();

      // Remove the employee from the 'members' field of the location document
      bulkWriter.update(firestore().collection("Locations").doc(locationId), {
        members: firestore.FieldValue.arrayRemove(employeeId),
      });
      // Remove the employee from all conversations in the location
      await removeEmployeeFromAllConversation(
        employeeId,
        locationId,
        bulkWriter
      );

      // Remove the employee from the location's boards
      for await (const boardName of BOARDS) {
        await removeEmployeeFromAllBoards(
          employeeId,
          locationId,
          boardName,
          bulkWriter
        );
      }

      // Commit the batch to apply the updates
      await bulkWriter.close();

      // Remove the location's notifications from the user's notifications object
      await database()
        .ref(
          `users/${employeeId}/notifications/organizations/${organizationId}/locations/${locationId}`
        )
        .remove();

      // Delete the employee's files from storage

      await storage()
        .bucket()
        .deleteFiles({
          prefix: `organizations/${locationId}/employees/${employeeId}/locations/${locationId}`,
        });

      // Clear the user's custom claims for the organization
      if (role > RoleAccessLevels.ADMIN) {
        await clearUserClaims([employeeId], locationId);
      }
    } catch (error) {
      // Handle any errors that may occur during the update process
      handleError(error);
    }
  });

export async function removeEmployeeFromAllConversation(
  employeeId: string, // ID of the employee to be removed from conversations
  locationId: string, // ID of the location where the conversations take place
  batch: firestore.BulkWriter // Batch object to batch the updates to conversations
) {
  // Get all conversations that the employee is a member of
  const conversationsAsMember = await firestore()
    .collection("Locations")
    .doc(locationId) // Select the location document
    .collection("conversations") // Select the conversations subcollection
    .where("members", "array-contains", employeeId) // Select only conversations where the employee is a member
    .get();

  // If there are conversations where the employee is a member
  if (!conversationsAsMember.empty) {
    // Loop through the conversations
    conversationsAsMember.forEach((conversation) => {
      const { hosts, muted } = conversation.data() as IConversation; // Get the hosts field from the conversation document
      const updates: {
        members: FirebaseFirestore.FieldValue; // The 'members' field will be updated
        hosts?: FirebaseFirestore.FieldValue; // The 'hosts' field may also be updated, if the employee is a host
        muted?: FirebaseFirestore.FieldValue; // The 'muted' field may also be updated, if the employee is muted
      } = {
        members: firestore.FieldValue.arrayRemove(employeeId), // Remove the employee from the 'members' field
      };
      // If the employee is a host, remove them from the 'hosts' field as well
      if (hosts && hosts.includes(employeeId)) {
        updates.hosts = firestore.FieldValue.arrayRemove(employeeId);
      }
      // If the employee is muted, remove them from the 'muted' field as well
      if (muted && muted.includes(employeeId)) {
        updates.muted = firestore.FieldValue.arrayRemove(employeeId);
      }
      // Add the update operation to the batch
      batch.update(conversation.ref, updates);
    });
  }
}

export async function removeEmployeeFromAllBoards(
  employeeId: string,
  locationId: string,
  boardName: string,
  batch: firestore.BulkWriter
) {
  const privateBoardsAsMember = await firestore()
    .collection("Locations")
    .doc(locationId)
    .collection(boardName)
    .where("privacyLevel", "==", PrivacyLevel.PRIVATE)
    .where("accessTags", "array-contains", employeeId)
    .get();

  const boardsAsHost = await firestore()
    .collection("Locations")
    .doc(locationId)
    .collection(boardName)
    .where("privacyLevel", ">", PrivacyLevel.PRIVATE)
    .where("hosts", "array-contains", employeeId)
    .get();

  if (!privateBoardsAsMember.empty) {
    privateBoardsAsMember.forEach((board) => {
      const { hosts } = board.data() as IBoard;
      const updates: {
        accessTags: FirebaseFirestore.FieldValue;
        hosts?: FirebaseFirestore.FieldValue;
      } = {
        accessTags: firestore.FieldValue.arrayRemove(employeeId),
      };

      if (hosts && hosts.includes(employeeId)) {
        updates.hosts = firestore.FieldValue.arrayRemove(employeeId);
      }

      batch.update(board.ref, updates);
    });
  }

  if (!boardsAsHost.empty) {
    boardsAsHost.forEach((board) => {
      batch.update(board.ref, {
        accessTags: firestore.FieldValue.arrayRemove(`hostId_${employeeId}`),
        hosts: firestore.FieldValue.arrayRemove(employeeId),
      });
    });
  }
}
