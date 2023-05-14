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
import { cuttinboardUserConverter } from "../models/converters/cuttinboardUserConverter";

export default async function deleteEmployees(
  locationId: string,
  employees: IEmployee[],
  allDeleted?: boolean,
  bulkWriter?: firestore.BulkWriter
) {
  const employeesIds = employees.map((employee) => employee.id);

  const organizationId = employees[0].organizationId;

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

    // Remove employees membership from the location
    await removeEmployeesMembershipToLocation(
      locationId,
      organizationId,
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
        .where(`members.${emp.id}`, "in", [true, false])
        .withConverter(conversationConverter)
        .get();

      // If there are conversations where the employee is a member
      if (!conversations.empty) {
        // Loop through the conversations
        conversations.forEach((conversation) => {
          const { guests } = conversation.data();
          dbUpdates[`users/${emp.id}/notifications/conv/${conversation.id}`] =
            null;

          const firestoreUpdates: PartialWithFieldValue<IConversation> = {
            members: {
              [emp.id]: firestore.FieldValue.delete(),
            },
          };

          if (guests && guests.includes(emp.id)) {
            firestoreUpdates.guests = firestore.FieldValue.arrayRemove(emp.id);
          }

          bulkWriter.set(conversation.ref, firestoreUpdates, { merge: true });
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
            bulkWriter.set(
              board.ref,
              {
                details: {
                  members: firestore.FieldValue.arrayRemove(emp.id),
                  admins: firestore.FieldValue.arrayRemove(emp.id),
                },
              },
              { merge: true }
            );
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

export async function removeEmployeesMembershipToLocation(
  locationId: string,
  organizationId: string,
  employees: IEmployee[],
  bulkWriter: firestore.BulkWriter
) {
  try {
    const operations = employees.map(async (emp) => {
      const fieldsOrPrecondition: any[] = [
        `organizationsRelationship.${organizationId}`,
        firestore.FieldValue.arrayRemove(locationId),
      ];

      const onlyEmployee = emp.role >= RoleAccessLevels.GENERAL_MANAGER;

      const userDocumentRef = firestore()
        .collection("Users")
        .doc(emp.id)
        .withConverter(cuttinboardUserConverter);

      if (onlyEmployee) {
        const userData = (await userDocumentRef.get()).data();

        // Check if the employee has other locations in the same organization
        const otherLocationsInOrganization =
          userData?.organizationsRelationship?.[organizationId]?.filter(
            (loc) => loc !== locationId
          );

        if (
          !otherLocationsInOrganization ||
          otherLocationsInOrganization.length === 0
        ) {
          // If the employee doesn't have other locations in the same organization
          // Remove the organization from the employee's organizations array
          fieldsOrPrecondition.push(
            "organizations",
            firestore.FieldValue.arrayRemove(organizationId)
          );
        }
      }

      bulkWriter.update(
        userDocumentRef,
        "locations",
        firestore.FieldValue.arrayRemove(locationId),
        ...fieldsOrPrecondition
      );
    });

    await Promise.all(operations);
  } catch (error) {
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
