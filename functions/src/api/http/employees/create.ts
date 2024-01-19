import {
  IOrganizationKey,
  ManagerPermissions,
  RoleAccessLevels,
} from "@rodez97/types-helpers";
import { inviteEmployee } from "../../../services/inviteEmployee";
import { HttpsError, onCall } from "firebase-functions/v2/https";

export interface EmployeeData {
  name: string;
  lastName: string;
  email: string;
  role:
    | RoleAccessLevels.GENERAL_MANAGER
    | RoleAccessLevels.MANAGER
    | RoleAccessLevels.STAFF;
  locationId?: string;
  positions?: string[];
  wagePerPosition?: Record<string, number>;
  mainPosition?: string;
  permissions?: ManagerPermissions;
}

/**
 * Add a new employee to the organization or location
 */
export default onCall<EmployeeData>(async (request) => {
  const { auth, data } = request;

  if (!auth) {
    // If the user is not authenticated then return an error
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  // Employee registration data
  const { locationId, name, lastName, email, role } = data;

  if (!name || !lastName || !email || !role || !locationId) {
    // If the required data is not provided then return an error
    throw new HttpsError(
      "invalid-argument",
      "The function must be called with valid data. (name, lastName, email, role, locationId)"
    );
  }

  if (email === auth.token.email) {
    // If the user is trying to add himself then return an error
    throw new HttpsError(
      "invalid-argument",
      "You can not add yourself as an employee."
    );
  }

  // Get the access key from the auth token.
  const organizationKey: IOrganizationKey | undefined =
    auth.token?.organizationKey;

  if (!organizationKey) {
    // If the access key is not provided then return an error
    throw new HttpsError(
      "invalid-argument",
      "The function must be called with a valid access key for this location."
    );
  }

  // Extract the access data from the access key for the user that is inviting the employee.
  const { role: myRole, locId, orgId } = organizationKey;

  if (locId !== locationId) {
    // If the locationId provided does not match the locationId from the access key then return an error
    throw new HttpsError(
      "invalid-argument",
      "The locationId provided does not match the locationId from the access key."
    );
  }

  if (myRole >= role) {
    // If the role of the user that is inviting the employee is greater than the role of the employee then return an error
    throw new HttpsError(
      "permission-denied",
      "You can not invite an employee with a higher or equal role than you."
    );
  }

  // Invite the employee
  const result = await inviteEmployee({
    ...data,
    organizationId: orgId,
    locationId,
  });

  if (result) {
    return result;
  } else {
    // If the employee is already registered then return an error
    throw new HttpsError(
      "already-exists",
      "There was an error inviting the employee."
    );
  }
});
