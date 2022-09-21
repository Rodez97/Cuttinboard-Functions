import axios from "axios";
import { auth, database } from "firebase-admin";
import { logger } from "firebase-functions";
import { isEqual } from "lodash";
import MainVariables from "../config";
import OrganizationKey from "../models/OrganizationKey";
import RoleAccessLevels from "../models/RoleAccessLevels";

export const checkIfUserExistsByEmail = async (
  email: string
): Promise<{ exists: true; uid: string } | { exists: false }> =>
  auth()
    .getUserByEmail(email)
    .then((user) => ({ exists: true, uid: user.uid }))
    .catch(() => ({ exists: false }));

export const updateUserClaims = async (
  userId: string,
  newOrganizationKey: OrganizationKey
) => {
  try {
    const { customClaims } = await auth().getUser(userId);
    if (!customClaims) {
      return;
    }
    const { organizationKey } = customClaims;
    if (!organizationKey || isEqual(organizationKey, newOrganizationKey)) {
      return;
    }

    await auth().setCustomUserClaims(userId, {
      organizationKey: newOrganizationKey,
    });

    // Update real-time database to notify client to force refresh.
    const metadataRef = database().ref(`users/${userId}/metadata`);

    // Set the refresh time to the current UTC timestamp.
    // This will be captured on the client to force a token refresh.
    await metadataRef.set({ refreshTime: new Date().getTime() });
  } catch (error) {
    throw error;
  }
};

/**
 * Reliza una comparación entre los roles de dos usuarios y verifica que el primero tenga permisos sobre el segundo.
 * @param {RoleAccessLevels} userRole Rol del usuario que está llamando la función
 * @param {RoleAccessLevels} employeeRole Rol del usuario con el cuál se quiere comparar el rol
 * @returns {boolean} Devuelve *true* si en usuario que realizó la comparación tiene permisos (rango superior) sobre el empleado en cuestión, en caso contrario devuelve *false*
 */
export const CompareRoles = (
  userRole: RoleAccessLevels,
  employeeRole: RoleAccessLevels
) => {
  return userRole < employeeRole;
};

export const clearUserClaims = async (
  usersId: string[],
  organizationId: string
) => {
  try {
    const { users } = await auth().getUsers(
      usersId.map((userId) => ({ uid: userId }))
    );
    const updates: { [key: string]: any } = {};
    for await (const user of users) {
      const { customClaims } = user;
      if (customClaims?.organizationKey.orgId === organizationId) {
        // Set custom user claims on this newly created user.
        await auth().setCustomUserClaims(user.uid, null);

        // Update real-time database to notify client to force refresh.
        const metadataRef = database().ref(`users/${user.uid}/metadata`);

        // Set the refresh time to the current UTC timestamp.
        // This will be captured on the client to force a token refresh.
        await metadataRef.set({ refreshTime: new Date().getTime() });
      }
    }
    // Set the refresh time to the current UTC timestamp.
    // This will be captured on the client to force a token refresh.
    await database().ref().set(updates);
  } catch (error) {
    logger.log("No se pudo actualizar el token", error);
  }
};

/**
 * Check if the user password is valid
 * @param email User email
 * @param password User password
 * @returns True if user password is valid, false otherwise
 */
export async function checkPassword(email: string, password: string) {
  try {
    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${MainVariables.apiKey}`,
      { email, password, returnSecureToken: true }
    );
    if (response.status !== 200) {
      return false;
    }
  } catch (error) {
    return false;
  }
  return true;
}
