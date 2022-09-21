import { FirebaseError, firestore } from "firebase-admin";
import { https, logger } from "firebase-functions";
import RoleAccessLevels from "../../../models/RoleAccessLevels";
import { inviteEmployee, inviteSupervisor } from "../../../services/employees";

/**
 * Añadir empleados a la locación
 */
export default https.onCall(async (data, context) => {
  const { auth } = context;
  const {
    locationId,
    name,
    lastName,
    email,
    role,
    positions,
    wagePerPosition,
    mainPosition,
    supervisingLocations,
  } = data;
  // Comprobando que el usuario está autenticado.
  if (!auth) {
    // Lanzar un HttpsError para que el cliente obtenga los detalles del error.
    throw new https.HttpsError(
      "failed-precondition",
      "The function must be called while authenticated!"
    );
  }

  if (!name || !lastName || !email || !role) {
    throw new https.HttpsError(
      "failed-precondition",
      "The function must be called correct data!"
    );
  }

  if (email === auth.token.email) {
    return;
  }

  if (role === 1) {
    // Check if the user who called the function is owner of an organization
    const userOrg = await firestore()
      .collection("Organizations")
      .doc(auth.uid)
      .get();
    if (!userOrg.exists || userOrg.get("subscriptionStatus") === "canceled") {
      return;
    }
    const addedBy = auth.token["name"] ?? auth.token.email;
    try {
      return await inviteSupervisor(
        name,
        lastName,
        email,
        auth.uid,
        supervisingLocations,
        addedBy
      );
    } catch (error) {
      const { code, message } = error as FirebaseError;
      throw new https.HttpsError(
        "failed-precondition",
        JSON.stringify({ code, message })
      );
    }
  }

  const { organizationKey } = auth.token;
  // Comprobar que el usuario posea la llave de la locación
  if (!organizationKey) {
    // Lanzar un HttpsError para que el cliente obtenga los detalles del error.
    throw new https.HttpsError(
      "failed-precondition",
      "Missing <organizationKey> auth claims"
    );
  }

  const { role: myRole, locKeys, orgId } = organizationKey;

  if (!locationId) {
    throw new https.HttpsError(
      "failed-precondition",
      "Missing <locationId> attribute"
    );
  }

  const getRole = (): RoleAccessLevels => {
    if (typeof myRole === "number" && myRole <= RoleAccessLevels.ADMIN) {
      return myRole;
    }
    return typeof locKeys?.[locationId]?.role === "number"
      ? locKeys[locationId].role
      : RoleAccessLevels.STAFF;
  };

  // Comprobar que el usuario tenga el rol necesario para ejecutar la función
  if (getRole() > role) {
    logger.error(
      `Adding employee to ${locationId}`,
      `My role is ${getRole()}`,
      `The employee role is ${role}`,
      "Org key:",
      organizationKey
    );
    throw new https.HttpsError(
      "failed-precondition",
      "The user does not have the necessary role to execute the function"
    );
  }

  try {
    return await inviteEmployee(
      name,
      lastName,
      email,
      locationId,
      orgId,
      role,
      positions ?? [],
      mainPosition,
      wagePerPosition
    );
  } catch (error) {
    const { code, message } = error as FirebaseError;
    throw new https.HttpsError(
      "failed-precondition",
      JSON.stringify({ code, message })
    );
  }
});
