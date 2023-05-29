import {
  IConversation,
  IEmployee,
  RoleAccessLevels,
} from "@cuttinboard-solutions/types-helpers";
import { database, firestore, storage } from "firebase-admin";
import * as functions from "firebase-functions";
import { BOARDS } from "../config";
import { clearUserClaimsLocation } from "./auth";
import {
  boardConverter,
  conversationConverter,
} from "../models/converters/directMessageConverter";
import { PartialWithFieldValue } from "firebase-admin/firestore";
import { uniqBy } from "lodash";

export default async function deleteEmployees(
  locationId: string,
  employees: IEmployee[],
  allDeleted?: boolean,
  bulkWriter?: firestore.BulkWriter
) {
  const employeesIds = employees.map((employee) => employee.id);

  const locationLevelEmployees = employees.filter(
    (employee) => employee.role > RoleAccessLevels.ADMIN
  );

  try {
    const innerBulkWriter = bulkWriter ?? firestore().bulkWriter();

    // Remove the employee from the 'members' field of the location document
    innerBulkWriter.update(
      firestore().collection("Locations").doc(locationId),
      {
        members: firestore.FieldValue.arrayRemove(...employeesIds),
      }
    );

    // Remove the employee from the location's boards
    await removeEmployeesFromAllBoards(locationId, employees, innerBulkWriter);

    // Remove the employee from all conversations in the location
    await removeEmployeesFromAllConversations(
      locationId,
      employees,
      innerBulkWriter
    );

    // Commit the batch to apply the updates
    if (!bulkWriter) {
      await innerBulkWriter.close();
    }

    // Remove the employee shifts from the location
    await removeEmployeesShifts(locationId, employeesIds);

    // Clear the user's custom claims for the organization
    if (locationLevelEmployees.length > 0) {
      await clearUserClaimsLocation(
        locationLevelEmployees.map((e) => e.id),
        locationId
      );
    }

    // Delete the employee's files from storage
    if (!allDeleted) {
      await removeEmployeeFiles(locationId, employeesIds);
    }
  } catch (error: any) {
    functions.logger.error(error);
  }
}

export async function removeEmployeeFiles(
  locationId: string,
  employeesIds: string[]
) {
  try {
    const bucket = storage().bucket();

    const removeEmployeeFilesById = async (emp: string) => {
      await bucket.deleteFiles({
        prefix: `locations/${locationId}/employees/${emp}`,
      });
    };

    await Promise.all(employeesIds.map(removeEmployeeFilesById));
  } catch (error: any) {
    functions.logger.error(error);
  }
}

export async function removeEmployeesFromAllConversations(
  locationId: string,
  employees: IEmployee[],
  bulkWriter: firestore.BulkWriter
) {
  try {
    const dbUpdates: Record<string, null> = {};

    const updateConversationsForEmployee = async (emp: IEmployee) => {
      // Get all conversations that the employee is a member of
      const conversations = await firestore()
        .collection("conversations")
        .where("locationId", "==", locationId)
        .where(`members.${emp.id}.muted`, "in", [true, false])
        .withConverter(conversationConverter)
        .get();

      // If there are conversations where the employee is a member
      if (!conversations.empty) {
        // Loop through the conversations
        conversations.forEach((conversation) => {
          const { guests } = conversation.data();
          dbUpdates[`users/${emp.id}/notifications/conv/${conversation.id}`] =
            null;

          const firestoreUpdates: PartialWithFieldValue<IConversation> = {};

          firestoreUpdates[`members.${emp.id}`] = firestore.FieldValue.delete();

          if (guests && guests.includes(emp.id)) {
            firestoreUpdates["guests"] = firestore.FieldValue.arrayRemove(
              emp.id
            );
          }

          bulkWriter.update(conversation.ref, firestoreUpdates);
        });
      }
    };

    await Promise.all(employees.map(updateConversationsForEmployee));

    if (Object.keys(dbUpdates).length > 0) {
      await database().ref().update(dbUpdates);
    }
  } catch (error: any) {
    functions.logger.error(error);
  }
}

export async function removeEmployeesFromAllBoards(
  locationId: string,
  employees: IEmployee[],
  bulkWriter: firestore.BulkWriter
) {
  try {
    const operations = employees.map(async (emp) => {
      const updateBoard = async (boardName: string) => {
        const boardsAsMember = await Promise.all([
          firestore()
            .collection("Locations")
            .doc(locationId)
            .collection(boardName)
            .where("details.members", "array-contains", emp.id)
            .withConverter(boardConverter)
            .get(),
          firestore()
            .collection("Locations")
            .doc(locationId)
            .collection(boardName)
            .where("details.admins", "array-contains", emp.id)
            .withConverter(boardConverter)
            .get(),
        ]);

        const normalizedBoards = uniqBy(
          boardsAsMember.flatMap((board) => board.docs),
          "id"
        );

        if (normalizedBoards.length > 0) {
          normalizedBoards.forEach((board) => {
            bulkWriter.update(board.ref, {
              [`details.members`]: firestore.FieldValue.arrayRemove(emp.id),
              [`details.admins`]: firestore.FieldValue.arrayRemove(emp.id),
            });
          });
        }
      };

      await Promise.all(BOARDS.map(updateBoard));
    });

    await Promise.all(operations);
  } catch (error: any) {
    functions.logger.error(error);
  }
}

export async function removeEmployeesShifts(
  locationId: string,
  employees: string[]
) {
  const batch = firestore().batch();

  try {
    const operations = employees.map(async (emp) => {
      const employeeShiftsRef = firestore()
        .collection(`shifts`)
        .where("locationId", "==", locationId)
        .where("employeeId", "==", emp);

      const employeeShifts = await employeeShiftsRef.get();

      employeeShifts.forEach((shift) => {
        batch.delete(shift.ref);
      });
    });

    await Promise.all(operations);

    await batch.commit();
  } catch (error: any) {
    functions.logger.error(error);
  }
}
