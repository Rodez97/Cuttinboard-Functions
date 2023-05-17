import {
  IEmployee,
  IOrganizationKey,
  PrivacyLevel,
  getEmployeeFullName,
} from "@cuttinboard-solutions/types-helpers";
import { auth, database, firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { difference, differenceBy, isEqual } from "lodash";
import { addEmployeesToPublicConversations } from "./addEmployeesToPublicConversations";
import deleteEmployees from "./deletedEmployees";
import { conversationConverter } from "../models/converters/directMessageConverter";

export default async function updatedEmployees(
  locationId: string,
  beforeEmployees: IEmployee[],
  afterEmployees: IEmployee[]
) {
  const newEmployees = differenceBy(afterEmployees, beforeEmployees, "id");

  const updatedEmployees = afterEmployees.filter((afterEmployee) =>
    beforeEmployees.some(
      (beforeEmployee) => beforeEmployee.id === afterEmployee.id
    )
  );

  const oldEmployees = differenceBy(beforeEmployees, afterEmployees, "id");

  const bulkWriter: firestore.BulkWriter = firestore().bulkWriter();

  if (newEmployees.length > 0) {
    // Add the employee as member to the location's public conversations
    await addEmployeesToPublicConversations(
      locationId,
      newEmployees,
      bulkWriter
    );
  }

  if (oldEmployees.length > 0) {
    await deleteEmployees(locationId, oldEmployees, false, bulkWriter);
  }

  if (updatedEmployees.length > 0) {
    await updateEmployeesData(
      updatedEmployees,
      beforeEmployees,
      locationId,
      bulkWriter
    );
  }

  try {
    await bulkWriter.close();
  } catch (error) {
    functions.logger.error(error);
  }
}

async function updateEmployeesData(
  employeesToUpdate: IEmployee[],
  beforeEmployees: IEmployee[],
  locationId: string,
  bulkWriter: firestore.BulkWriter
) {
  const dbUpdates: Record<string, boolean | null> = {};
  const updatedOps = employeesToUpdate.map(async (employee) => {
    const beforeEmployee = beforeEmployees.find(
      (beforeEmployee) => beforeEmployee.id === employee.id
    );

    if (!beforeEmployee) {
      return;
    }

    const { positions: bPositions, role: bRole } = beforeEmployee;
    const { positions, role } = employee;

    if (isEqual(bPositions, positions) && bRole === role) {
      return;
    }

    const afterPositions = positions ? positions : [];
    const beforePositions = bPositions ? bPositions : [];

    if (!isEqual(afterPositions, beforePositions)) {
      const addedPositions = difference(afterPositions, beforePositions);
      const removedPositions = difference(beforePositions, afterPositions);

      await processChangedPositions(
        employee,
        locationId,
        addedPositions,
        removedPositions,
        bulkWriter,
        dbUpdates
      );
    }

    await updateEmployeeClaims(employee, locationId);
  });

  try {
    if (Object.keys(dbUpdates).length > 0) {
      await database().ref().update(dbUpdates);
    }
    await Promise.all(updatedOps);
  } catch (error: any) {
    functions.logger.error(error);
  }
}

async function updateEmployeeClaims(
  employeeData: IEmployee,
  locationId: string
) {
  try {
    const { customClaims } = await auth().getUser(employeeData.id);

    if (!customClaims) {
      return;
    }

    const organizationKey: IOrganizationKey | undefined =
      customClaims.organizationKey;

    if (!organizationKey || organizationKey.locId !== locationId) {
      return;
    }

    const { orgId } = organizationKey;

    const newOrganizationKey: IOrganizationKey = {
      orgId,
      locId: locationId,
      role: employeeData.role,
      pos: employeeData.positions ?? [],
    };

    await auth().setCustomUserClaims(employeeData.id, {
      organizationKey: newOrganizationKey,
    });

    // Update the user's data in the database
    await database()
      .ref(`users/${employeeData.id}/notifications`)
      .update({ claims: new Date().getTime() });
  } catch (error) {
    functions.logger.error(error);
  }
}

async function processChangedPositions(
  employee: IEmployee,
  locationId: string,
  newPositions: string[],
  oldPositions: string[],
  bulkWriter: firestore.BulkWriter,
  dbUpdates: Record<string, boolean | null>
) {
  try {
    const conversations = await firestore()
      .collection("conversations")
      .where("locationId", "==", locationId)
      .where("privacyLevel", "==", PrivacyLevel.POSITIONS)
      .withConverter(conversationConverter)
      .get();

    if (!conversations.empty) {
      for (const conversation of conversations.docs) {
        const { position, guests } = conversation.data();

        if (!position) {
          functions.logger.error(
            `Conversation ${conversation.id} has no position`
          );
          continue;
        }

        if (guests && guests.includes(employee.id)) {
          // The employee is a guest in this conversation
          continue;
        }

        if (newPositions.includes(position)) {
          bulkWriter.set(
            conversation.ref,
            {
              members: {
                [employee.id]: {
                  name: getEmployeeFullName(employee),
                  avatar: employee.avatar,
                  muted: false,
                },
              },
            },
            { merge: true }
          );
        }
        if (oldPositions.includes(position)) {
          dbUpdates[
            `users/${employee.id}/notifications/conv/${conversation.id}`
          ] = null;
          bulkWriter.set(
            conversation.ref,
            {
              members: {
                [employee.id]: firestore.FieldValue.delete(),
              },
            },
            { merge: true }
          );
        }
      }
    }
  } catch (error: any) {
    functions.logger.error(error);
  }
}
