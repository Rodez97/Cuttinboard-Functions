import {
  IOrganizationKey,
  RoleAccessLevels,
} from "@cuttinboard-solutions/types-helpers";
import axios from "axios";
import { auth, database } from "firebase-admin";
import { isEqual } from "lodash";
import { MainVariables } from "../config";
import { updateUserMetadata } from "./updateUserMetadata";
import { logger } from "firebase-functions";

/**
 * Check if a user exists in Auth by his email.
 * @param email Email of the user to check.
 * @returns True if the user exists, false otherwise.
 */
export const checkIfUserExistsByEmail = async (
  email: string
): Promise<{ exists: true; uid: string } | { exists: false }> =>
  auth()
    .getUserByEmail(email)
    .then((user) => ({ exists: true, uid: user.uid }))
    .catch(() => ({ exists: false }));

/**
 * Check if a user exists in Auth by his uid.
 * @param uid Uid of the user to check.
 * @returns True if the user exists, false otherwise.
 */
export const checkIfUserExistsByUid = async (
  uid: string
): Promise<{ exists: true; uid: string } | { exists: false }> =>
  auth()
    .getUser(uid)
    .then((user) => ({ exists: true, uid: user.uid }))
    .catch(() => ({ exists: false }));

/**
 * Update the user's access claims in Auth with a new organization key.
 * @param userId Uid of the user to update.
 * @param newOrganizationKey New organization key to add to the user's access claims.
 * @returns True if the user's access claims were updated, false otherwise.
 */
export const updateUserClaims = async (
  userId: string,
  newOrganizationKey: IOrganizationKey
) => {
  const { customClaims } = await auth().getUser(userId);
  if (!customClaims) {
    // If the user doesn't have any claims, we don't need to update them
    return false;
  }
  const { organizationKey } = customClaims;
  if (!organizationKey || isEqual(organizationKey, newOrganizationKey)) {
    // If the user doesn't have any organization key or the organization key is the same, we don't need to update it
    return false;
  }

  // Update the user's claims
  await auth().setCustomUserClaims(userId, {
    organizationKey: newOrganizationKey,
  });

  // Update the user's claims in the database
  await updateUserMetadata({ uid: userId });

  return true;
};

/**
 * Compare the roles of two users and return true if the first user has a higher role than the second user.
 * @param userRole Role of the first user.
 * @param employeeRole Role of the second user.
 * @returns True if the first user has a higher role than the second user, false otherwise.
 */
export const CompareRoles = (
  userRole: RoleAccessLevels,
  employeeRole: RoleAccessLevels
) => {
  return userRole < employeeRole;
};

/**
 * Clear the user's access claims in Auth of a specific organization key.
 * @param usersId Uid of the user to update.
 * @param organizationId Organization id of the organization key to remove from the user's access claims.
 */
export const clearUserClaims = async (
  usersId: string[],
  organizationId: string
) => {
  // Get the auth users by their uids
  const { users } = await auth().getUsers(
    usersId.map((userId) => ({ uid: userId }))
  );
  // initialize the updates object
  const updates: { [key: string]: any } = {};
  // Loop through the users
  for await (const user of users) {
    // Get the user's claims
    const { customClaims } = user;
    if (!customClaims) {
      // If the user doesn't have any claims, we don't need to update them
      continue;
    }
    const { organizationKey } = customClaims;
    if (!organizationKey) {
      // If the user doesn't have any organization key, we don't need to update it
      continue;
    }
    // Check if the organization key is the one we want to remove
    if (organizationKey.orgId === organizationId) {
      // Remove the organization key from the user's claims
      await auth().setCustomUserClaims(user.uid, null);
      // Update real-time database to notify client to force refresh.
      // Set the refresh time to the current UTC timestamp.
      // This will be captured on the client to force a token refresh.
      updates[`users/${user.uid}/notifications`] = {
        claims: new Date().getTime(),
      };
    }
  }

  if (Object.keys(updates).length === 0) {
    // If there are no updates, return
    return;
  }

  // Update the database
  await database().ref().update(updates);
};

/**
 * Check the veracity of the user's password.
 * @param email Email of the user to check.
 * @param password Password of the user to check.
 * @returns True if the password is correct, false otherwise.
 */
export async function checkPassword(email: string, password: string) {
  try {
    // Get the user's data
    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${MainVariables.apiKey}`,
      { email, password, returnSecureToken: true }
    );
    if (response.status !== 200) {
      // If the request failed, return false
      return false;
    }
  } catch (error) {
    // If the request failed, return false
    return false;
  }
  // If the request succeeded, return true
  return true;
}

export const clearUserClaimsLocation = async (
  usersId: string[],
  locationId: string
) => {
  try {
    // Get the auth users by their uids
    const { users } = await auth().getUsers(
      usersId.map((userId) => ({ uid: userId }))
    );
    // Initialize the updates object
    const updates: { [key: string]: any } = {};

    const updateUserClaims = async (user: auth.UserRecord) => {
      const { customClaims } = user;

      if (!customClaims) {
        return;
      }

      const organizationKey: IOrganizationKey = customClaims.organizationKey;

      if (!organizationKey || organizationKey.locId !== locationId) {
        return;
      }

      await auth().setCustomUserClaims(user.uid, null);

      updates[`users/${user.uid}/notifications`] = {
        claims: new Date().getTime(),
      };
    };

    await Promise.all(users.map(updateUserClaims));

    if (Object.keys(updates).length === 0) {
      return;
    }

    // Update the database
    await database().ref().update(updates);
  } catch (error: any) {
    logger.error(error);
  }
};
