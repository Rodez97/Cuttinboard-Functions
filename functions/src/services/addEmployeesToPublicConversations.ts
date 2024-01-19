import {
  IConversation,
  IEmployee,
  PrivacyLevel,
  getEmployeeFullName,
} from "@rodez97/types-helpers";
import { firestore } from "firebase-admin";
import { conversationConverter } from "../models/converters/directMessageConverter";
import { logger } from "firebase-functions";
import { PartialWithFieldValue } from "firebase-admin/firestore";

export async function addEmployeesToPublicConversations(
  locationId: string,
  employees: IEmployee[],
  bulkWriter?: firestore.BulkWriter
) {
  try {
    const innerBulkWriter: firestore.BulkWriter = bulkWriter
      ? bulkWriter
      : firestore().bulkWriter();

    const conversationsSnapshot = await firestore()
      .collection("conversations")
      .where("locationId", "==", locationId)
      .where("privacyLevel", "in", [
        PrivacyLevel.PUBLIC,
        PrivacyLevel.POSITIONS,
      ])
      .withConverter(conversationConverter)
      .get();

    if (conversationsSnapshot.size > 0) {
      // Create an array of promises for each update operation
      conversationsSnapshot.forEach((conversationDoc) => {
        const { privacyLevel, position } = conversationDoc.data();
        const conversationRef = conversationDoc.ref;

        const documentUpdates: PartialWithFieldValue<IConversation> = {};

        for (const employee of employees) {
          if (
            privacyLevel === PrivacyLevel.PUBLIC ||
            (position && employee.positions?.includes(position))
          ) {
            // Add the employee as a member to the conversation
            documentUpdates[`members.${employee.id}`] = {
              name: getEmployeeFullName(employee),
              avatar: employee.avatar,
              muted: false,
            };
          }
        }

        // Perform the bulk write operation
        if (Object.keys(documentUpdates).length > 0) {
          innerBulkWriter.update(conversationRef, documentUpdates);
        }
      });

      // Close the bulk writer
      if (!bulkWriter) {
        await innerBulkWriter.close();
      }
    }
  } catch (error: any) {
    logger.error(error);
  }
}

export async function updateEmployeesFromPublicConversations(
  locationId: string,
  employees: IEmployee[],
  dbUpdates: Record<string, boolean | number | object | null>,
  bulkWriter: firestore.BulkWriter
) {
  try {
    const conversationsSnapshot = await firestore()
      .collection("conversations")
      .where("locationId", "==", locationId)
      .where("privacyLevel", "==", PrivacyLevel.POSITIONS)
      .withConverter(conversationConverter)
      .get();

    if (conversationsSnapshot.size > 0) {
      // Create an array of promises for each update operation
      conversationsSnapshot.forEach((conversationDoc) => {
        const { position, members, guests } = conversationDoc.data();
        const conversationRef = conversationDoc.ref;

        if (!position) {
          logger.error(`Conversation ${conversationDoc.id} has no position`);
          return;
        }

        const documentUpdates: PartialWithFieldValue<IConversation> = {};

        for (const employee of employees) {
          const isGuest = Boolean(guests?.includes(employee.id));
          const isMember = Boolean(members[employee.id]);
          const hasPosition = Boolean(employee.positions?.includes(position));

          if (hasPosition && !isMember) {
            // The employee matches the position and is not a member of the conversation
            // Add the employee to the conversation
            documentUpdates[`members.${employee.id}`] = {
              name: getEmployeeFullName(employee),
              avatar: employee.avatar,
              muted: false,
            };
          }
          if (hasPosition && isGuest) {
            documentUpdates[`guests`] = firestore.FieldValue.arrayRemove(
              employee.id
            );
          }
          if (!hasPosition && isMember && !isGuest) {
            // The employee does not match the position and is a member of the conversation
            // Remove the employee from the conversation
            documentUpdates[`members.${employee.id}`] =
              firestore.FieldValue.delete();

            dbUpdates[
              `users/${employee.id}/notifications/conv/${conversationDoc.id}`
            ] = null;
          }
        }

        // Perform the bulk write operation
        if (Object.keys(documentUpdates).length > 0) {
          bulkWriter.update(conversationRef, documentUpdates);
        }
      });
    }
  } catch (error: any) {
    logger.error(error);
  }
}
