import { auth, database, FirebaseError, firestore } from "firebase-admin";
import { https } from "firebase-functions";
import { chunk, differenceBy, isEqual } from "lodash";
import LocationKey from "../models/LocationKey";
import PrivacyLevel from "../models/PrivacyLevel";
import RoleAccessLevels from "../models/RoleAccessLevels";
import { checkIfUserExistsByEmail } from "./auth";
import { sendWelcomeEmail } from "./emails";
import { sendAddedToLocationNotification } from "./expo";
import { getUserExpoTokens } from "./users";

export const updateEmployeeConversations = async (
  organizationId: string,
  employeeId: string,
  beforeLocations: Record<string, LocationKey | true> | null,
  afterLocations: Record<string, LocationKey | true> | null
) => {
  if (isEqual(beforeLocations, afterLocations)) {
    return;
  }

  const beforeLocKeys: [string, boolean | LocationKey][] = beforeLocations
    ? Object.entries(beforeLocations)
    : [];
  const afterLocKeys: [string, boolean | LocationKey][] = afterLocations
    ? Object.entries(afterLocations)
    : [];

  const oldLocations = differenceBy(
    beforeLocKeys,
    afterLocKeys,
    ([key]) => key
  );

  const newLocations = differenceBy(
    afterLocKeys,
    beforeLocKeys,
    ([key]) => key
  );

  const updates: { [key: string]: any } = {};

  // Initialize batch to update the employee conversations
  const batch = firestore().batch();

  // ! Remove as member from old locations
  const oldConversationsQuery = chunk(oldLocations, 10).map((locChunk) =>
    firestore()
      .collection("Organizations")
      .doc(organizationId)
      .collection("conversations")
      .where("members", "array-contains", employeeId)
      .where(
        "locationId",
        "in",
        locChunk.map(([locId]) => locId)
      )
      .get()
  );
  const oldConversationsResponse = await Promise.all(oldConversationsQuery);
  const oldConversations = oldConversationsResponse.flatMap((res) => res.docs);
  for (const oldConv of oldConversations) {
    batch.update(oldConv.ref, {
      members: firestore.FieldValue.arrayRemove(employeeId),
    });
    const { locationId } = oldConv.data();
    if (!locationId) {
      continue;
    }
    updates[
      `conversations/${organizationId}/${locationId}/${oldConv.id}/members/${employeeId}`
    ] = null;
  }
  // ! New
  const newConversationsQuery = chunk(newLocations, 10).map((locChunk) =>
    firestore()
      .collection("Organizations")
      .doc(organizationId)
      .collection("conversations")
      .where("privacyLevel", "==", PrivacyLevel.PUBLIC)
      .where(
        "locationId",
        "in",
        locChunk.map(([locId]) => locId)
      )
      .get()
  );
  const newConversationsResponse = await Promise.all(newConversationsQuery);
  const newConversations = newConversationsResponse.flatMap((res) => res.docs);
  for (const newConv of newConversations) {
    batch.update(newConv.ref, {
      members: firestore.FieldValue.arrayUnion(employeeId),
    });
    const { locationId } = newConv.data();
    if (!locationId) {
      continue;
    }
    updates[
      `conversations/${organizationId}/${locationId}/${newConv.id}/members/${employeeId}`
    ] = employeeId;
  }

  // Positions
  // ! New or Persisted
  const allPositionsQuery = chunk(afterLocKeys, 10).map((locChunk) =>
    firestore()
      .collection("Organizations")
      .doc(organizationId)
      .collection("conversations")
      .where("privacyLevel", "==", PrivacyLevel.POSITIONS)
      .where(
        "locationId",
        "in",
        locChunk.map(([locId]) => locId)
      )
      .get()
  );
  const allPositionsConvResponse = await Promise.all(allPositionsQuery);
  const allPositionsConv = allPositionsConvResponse.flatMap((res) => res.docs);
  for (const posConv of allPositionsConv) {
    const { locationId, positions, members } = posConv.data();
    if (!locationId) {
      continue;
    }
    const locationKey = afterLocations?.[locationId];
    if (!locationKey || locationKey === true) {
      continue;
    }
    const { pos } = locationKey;
    const haveToBeMember = positions?.some((p: string) => pos?.includes(p));
    const isAlreadyMember = members?.includes(employeeId);
    if (isAlreadyMember && !haveToBeMember) {
      batch.update(posConv.ref, {
        members: firestore.FieldValue.arrayRemove(employeeId),
      });
      updates[
        `conversations/${organizationId}/${locationId}/${posConv.id}/members/${employeeId}`
      ] = null;
    } else if (!isAlreadyMember && haveToBeMember) {
      batch.update(posConv.ref, {
        members: firestore.FieldValue.arrayUnion(employeeId),
      });
      updates[
        `conversations/${organizationId}/${locationId}/${posConv.id}/members/${employeeId}`
      ] = employeeId;
    }
  }

  // Remove old shifts
  const oldShiftsQuery = oldLocations.map(([locId]) =>
    firestore()
      .collection("Locations")
      .doc(locId)
      .collection("shifts")
      .where("employeeId", "==", employeeId)
      .get()
  );
  const oldShiftsResponse = await Promise.all(oldShiftsQuery);
  const oldShifts = oldShiftsResponse.flatMap((res) => res.docs);
  for (const oldShift of oldShifts) {
    batch.delete(oldShift.ref);
  }

  try {
    await database().ref().update(updates);
    await batch.commit();
  } catch (error) {
    const { code, message } = error as FirebaseError;
    throw new https.HttpsError(
      "failed-precondition",
      JSON.stringify({ code, message })
    );
  }
};

export const inviteEmployee = async (
  Name: string,
  LastName: string,
  email: string,
  locationId: string,
  organizationId: string,
  role: RoleAccessLevels,
  positions: string[],
  mainPosition: string,
  wagePerPosition: {}
): Promise<{
  status: "ADDED" | "CREATED" | "ALREADY_MEMBER" | "CANT_ADD_ORG_EMP";
  employeeId: string;
}> => {
  // Obtener los datos de la locación
  const location = (
    await firestore().collection("Locations").doc(locationId).get()
  ).data();

  if (!location) {
    throw new https.HttpsError("failed-precondition", "Location not found");
  }

  const { name: locationName, members, limits } = location;
  const employeesLimit = limits.employees;

  if (members?.length === Number(employeesLimit)) {
    throw new https.HttpsError(
      "failed-precondition",
      "You cannot add a new employee as the maximum limit has been reached"
    );
  }

  const userExists = await checkIfUserExistsByEmail(email);
  if (!userExists.exists) {
    const employeeId = await createNewUserAndEmployee(
      Name,
      email,
      LastName,
      organizationId,
      locationId,
      role,
      positions,
      mainPosition,
      wagePerPosition,
      locationName
    );
    return { status: "CREATED", employeeId };
  }

  // Check if user is already present in the organization
  const employeeSnap = await firestore()
    .collection("Organizations")
    .doc(organizationId)
    .collection("employees")
    .doc(userExists.uid)
    .get();
  const employeeSnapData = employeeSnap.data();
  if (employeeSnap.exists && employeeSnapData) {
    const { name, expoToolsTokens, role } = employeeSnapData;

    if (typeof role === "number" && role <= 1) {
      return { status: "CANT_ADD_ORG_EMP", employeeId: userExists.uid };
    }

    try {
      await employeeSnap.ref.set(
        {
          locations: {
            [locationId]: {
              locId: locationId,
              role,
              pos: positions,
              startDate: firestore.FieldValue.serverTimestamp(),
              mainPosition,
              wagePerPosition,
            },
          },
        },
        { merge: true }
      );
      await sendAddedToLocationNotification(
        expoToolsTokens ?? [],
        locationName,
        organizationId,
        locationId
      );
      await sendWelcomeEmail(email, name, 3, {
        NAME: name,
        LOCATIONNAME: locationName,
      });
      return { status: "ALREADY_MEMBER", employeeId: userExists.uid };
    } catch (error) {
      throw error;
    }
  }

  // Add new employee to the organization
  const userSnap = await firestore()
    .collection("Users")
    .doc(userExists.uid)
    .get();
  const userData = userSnap.data();

  if (!userSnap.exists || !userData) {
    throw new https.HttpsError(
      "failed-precondition",
      "User root document not found"
    );
  }

  const { name, lastName, phoneNumber, avatar } = userData;
  const expoToolsTokens = await getUserExpoTokens(userExists.uid);
  const newEmployeeToAdd = {
    id: userExists.uid,
    name,
    lastName,
    phoneNumber,
    email,
    avatar,
    expoToolsTokens,
    organizationId,
    role: "employee",
    locations: {
      [locationId]: {
        locId: locationId,
        role,
        pos: positions,
        startDate: firestore.FieldValue.serverTimestamp(),
        mainPosition,
        wagePerPosition,
      },
    },
    startDate: firestore.FieldValue.serverTimestamp(),
  };
  try {
    // Añadir el usuario a la locación
    await firestore()
      .collection("Organizations")
      .doc(organizationId)
      .collection("employees")
      .doc(userExists.uid)
      .set(newEmployeeToAdd, { merge: true });
    await sendAddedToLocationNotification(
      expoToolsTokens ?? [],
      locationName,
      organizationId,
      locationId
    );
    await sendWelcomeEmail(email, name, 3, {
      NAME: name,
      LOCATIONNAME: locationName,
    });
    return { status: "ADDED", employeeId: userExists.uid };
  } catch (error) {
    throw error;
  }
};

export const inviteSupervisor = async (
  Name: string,
  LastName: string,
  email: string,
  organizationId: string,
  supervisingLocations: string[] = [],
  addedBy: string
): Promise<{
  status: "ADDED" | "CREATED" | "ALREADY_MEMBER";
  employeeId: string;
}> => {
  const userExists = await checkIfUserExistsByEmail(email);
  if (!userExists.exists) {
    const employeeId = await createNewUserAndAdmin(
      Name,
      email,
      LastName,
      organizationId,
      supervisingLocations,
      addedBy
    );
    return { status: "CREATED", employeeId };
  }

  // Check if user is already present in the organization
  const employeeSnap = await firestore()
    .collection("Organizations")
    .doc(organizationId)
    .collection("employees")
    .doc(userExists.uid)
    .get();
  const employeeSnapData = employeeSnap.data();
  if (employeeSnap.exists && employeeSnapData) {
    const { name } = employeeSnapData;
    try {
      const batch = firestore().batch();
      batch.update(employeeSnap.ref, {
        locations: firestore.FieldValue.delete(),
        supervisingLocations,
        role: RoleAccessLevels.ADMIN,
      });
      for (const loc of supervisingLocations) {
        batch.update(firestore().collection("Locations").doc(loc), {
          supervisors: firestore.FieldValue.arrayUnion(userExists.uid),
        });
      }
      await batch.commit();
      await sendWelcomeEmail(email, name, 11, {
        NAME: name,
        ADDED_BY: addedBy,
      });
      return { status: "ALREADY_MEMBER", employeeId: userExists.uid };
    } catch (error) {
      throw error;
    }
  }

  // Add new employee to the organization
  const userSnap = await firestore()
    .collection("Users")
    .doc(userExists.uid)
    .get();
  const userData = userSnap.data();

  if (!userSnap.exists || !userData) {
    throw new https.HttpsError(
      "failed-precondition",
      "User root document not found"
    );
  }

  const { name, lastName, phoneNumber, avatar } = userData;
  const expoToolsTokens = await getUserExpoTokens(userExists.uid);
  const newEmployeeToAdd = {
    id: userExists.uid,
    name,
    lastName,
    phoneNumber,
    email,
    avatar,
    expoToolsTokens,
    organizationId,
    role: RoleAccessLevels.ADMIN,
    supervisingLocations,
    startDate: firestore.FieldValue.serverTimestamp(),
  };
  try {
    const batch = firestore().batch();
    // Añadir el usuario a la locación
    batch.set(
      firestore()
        .collection("Organizations")
        .doc(organizationId)
        .collection("employees")
        .doc(userExists.uid),
      newEmployeeToAdd
    );
    for (const loc of supervisingLocations) {
      batch.update(firestore().collection("Locations").doc(loc), {
        supervisors: firestore.FieldValue.arrayUnion(userExists.uid),
      });
    }
    await batch.commit();
    await sendWelcomeEmail(email, name, 11, {
      NAME: name,
      ADDED_BY: addedBy,
    });
    return { status: "ADDED", employeeId: userExists.uid };
  } catch (error) {
    throw error;
  }
};

export async function createNewUserAndEmployee(
  name: string,
  email: string,
  lastName: string,
  organizationId: string,
  locationId: string,
  role: RoleAccessLevels,
  positions: string[],
  mainPosition: string,
  wagePerPosition: {},
  locationName: string
): Promise<string> {
  const randomPassword = Math.random().toString(36).slice(-8);
  const user = await auth().createUser({
    displayName: name,
    email,
    password: randomPassword,
    emailVerified: true,
  });
  const batch = firestore().batch();
  const newEmployeeToAdd = {
    id: user.uid,
    name,
    lastName,
    email,
    organizationId,
    role: "employee",
    locations: {
      [locationId]: {
        locId: locationId,
        role,
        pos: positions,
        startDate: firestore.FieldValue.serverTimestamp(),
        mainPosition,
        wagePerPosition,
      },
    },
  };
  batch.set(firestore().collection("Users").doc(user.uid), {
    name,
    lastName,
    email,
  });
  // Añadir el usuario a la locación
  batch.set(
    firestore()
      .collection("Organizations")
      .doc(organizationId)
      .collection("employees")
      .doc(user.uid),
    newEmployeeToAdd,
    { merge: true }
  );
  try {
    await batch.commit();
    await sendWelcomeEmail(email, name, 1, {
      NAME: name,
      LOCATIONNAME: locationName,
      PASSWORD: randomPassword,
    });
    return user.uid;
  } catch (error) {
    throw error;
  }
}

export async function createNewUserAndAdmin(
  name: string,
  email: string,
  lastName: string,
  organizationId: string,
  supervisingLocations: string[] = [],
  addedBy: string
): Promise<string> {
  const randomPassword = Math.random().toString(36).slice(-8);
  const user = await auth().createUser({
    displayName: name,
    email,
    password: randomPassword,
    emailVerified: true,
  });
  const batch = firestore().batch();
  const newEmployeeToAdd = {
    id: user.uid,
    name,
    lastName,
    email,
    organizationId,
    role: RoleAccessLevels.ADMIN,
    supervisingLocations,
  };
  batch.set(firestore().collection("Users").doc(user.uid), {
    name,
    lastName,
    email,
  });
  // Añadir el usuario a la locación
  batch.set(
    firestore()
      .collection("Organizations")
      .doc(organizationId)
      .collection("employees")
      .doc(user.uid),
    newEmployeeToAdd
  );
  for (const loc of supervisingLocations) {
    batch.update(firestore().collection("Locations").doc(loc), {
      supervisors: firestore.FieldValue.arrayUnion(user.uid),
    });
  }
  try {
    await batch.commit();
    await sendWelcomeEmail(email, name, 10, {
      NAME: name,
      ADDED_BY: addedBy,
      PASSWORD: randomPassword,
    });
    return user.uid;
  } catch (error) {
    throw error;
  }
}
