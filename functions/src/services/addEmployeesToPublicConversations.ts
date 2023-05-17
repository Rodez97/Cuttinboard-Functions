import {
  IConversation,
  IEmployee,
  PrivacyLevel,
  getEmployeeFullName,
} from "@cuttinboard-solutions/types-helpers";
import { firestore } from "firebase-admin";
import { conversationConverter } from "../models/converters/directMessageConverter";
import { logger } from "firebase-functions";

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
