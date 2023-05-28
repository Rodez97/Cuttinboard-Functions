import {
  IConversation,
  IEmployee,
  PrivacyLevel,
  getEmployeeFullName,
} from "@cuttinboard-solutions/types-helpers";
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
      const updatePromises = conversationsSnapshot.docs.map(
        async (conversationDoc) => {
          const { privacyLevel, position } = conversationDoc.data();
          const conversationRef = conversationDoc.ref;

          const documentUpdates: Partial<IConversation> = {
            members: {},
          };

          employees.forEach((employee) => {
            if (
              privacyLevel === PrivacyLevel.POSITIONS &&
              position &&
              employee.positions &&
              employee.positions.length > 0 &&
              employee.positions.includes(position)
            ) {
              documentUpdates.members = {
                ...documentUpdates.members,
                [employee.id]: {
                  name: getEmployeeFullName(employee),
                  avatar: employee.avatar,
                  muted: false,
                },
              };
            }
            if (privacyLevel === PrivacyLevel.PUBLIC) {
              documentUpdates.members = {
                ...documentUpdates.members,
                [employee.id]: {
                  name: getEmployeeFullName(employee),
                  avatar: employee.avatar,
                  muted: false,
                },
              };
            }
          });

          // Perform the bulk write operation
          innerBulkWriter.set(conversationRef, documentUpdates, {
            merge: true,
          });
        }
      );

      // Await all the promises to complete
      await Promise.all(updatePromises);

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
      const updatePromises = conversationsSnapshot.docs.map(
        async (conversationDoc) => {
          const { position, members, guests } = conversationDoc.data();
          const conversationRef = conversationDoc.ref;

          if (!position) {
            logger.error(`Conversation ${conversationDoc.id} has no position`);
            return;
          }

          const documentUpdates: PartialWithFieldValue<IConversation> = {};

          for (const employee of employees) {
            if (guests && guests.includes(employee.id)) {
              // The employee is a guest in this conversation
              continue;
            }

            if (!employee.positions || employee.positions.length === 0) {
              // The employee has no positions
              continue;
            }

            if (
              employee.positions.includes(position) &&
              !members[employee.id]
            ) {
              // The employee matches the position and is not a member of the conversation
              // Add the employee to the conversation
              documentUpdates[`members.${employee.id}`] = {
                name: getEmployeeFullName(employee),
                avatar: employee.avatar,
                muted: false,
              };
            } else if (
              !employee.positions.includes(position) &&
              members[employee.id]
            ) {
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
          bulkWriter.update(conversationRef, documentUpdates);
        }
      );

      // Await all the promises to complete
      await Promise.all(updatePromises);
    }
  } catch (error: any) {
    logger.error(error);
  }
}
