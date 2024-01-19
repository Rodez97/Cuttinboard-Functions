import { IEmployee, IOrganizationKey } from "@rodez97/types-helpers";
import { auth, database, firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { differenceBy, intersectionBy, isEqual } from "lodash";
import {
  addEmployeesToPublicConversations,
  updateEmployeesFromPublicConversations,
} from "./addEmployeesToPublicConversations";
import deleteEmployees from "./deletedEmployees";

export default async function updatedEmployees(
  locationId: string,
  beforeEmployees: IEmployee[],
  afterEmployees: IEmployee[]
) {
  const newEmployees = differenceBy(afterEmployees, beforeEmployees, "id");

  const oldEmployees = differenceBy(beforeEmployees, afterEmployees, "id");

  const updatedEmployees = intersectionBy(
    afterEmployees,
    beforeEmployees,
    "id"
  );

  const bUpdatedEmployees = intersectionBy(
    beforeEmployees,
    afterEmployees,
    "id"
  );

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

  const dbUpdates: Record<string, boolean | number | object | null> = {};

  if (updatedEmployees.length > 0) {
    await updateEmployeesFromPublicConversations(
      locationId,
      updatedEmployees,
      dbUpdates,
      bulkWriter
    );

    await updateEmployeeClaims(
      bUpdatedEmployees,
      updatedEmployees,
      locationId,
      dbUpdates
    );
  }

  try {
    await bulkWriter.close();

    if (Object.keys(dbUpdates).length > 0) {
      await database().ref().update(dbUpdates);
    }
  } catch (error) {
    functions.logger.error(error);
  }
}

async function updateEmployeeClaims(
  beforeEmployees: IEmployee[],
  afterEmployees: IEmployee[],
  locationId: string,
  dbUpdates: Record<string, boolean | number | object | null>
) {
  try {
    const ops = afterEmployees.map(async (employee) => {
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

      const { customClaims } = await auth().getUser(employee.id);

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
        role,
        pos: positions ?? [],
      };

      await auth().setCustomUserClaims(employee.id, {
        organizationKey: newOrganizationKey,
      });

      dbUpdates[`users/${employee.id}/notifications/claims`] =
        new Date().getTime();
    });

    await Promise.all(ops);
  } catch (error) {
    functions.logger.error(error);
  }
}
