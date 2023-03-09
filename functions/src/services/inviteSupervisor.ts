import {
  IEmployee,
  IOrganizationEmployee,
  RoleAccessLevels,
} from "@cuttinboard-solutions/types-helpers";
import { auth, firestore } from "firebase-admin";
import { https, logger } from "firebase-functions";
import { cuttinboardUserConverter } from "../models/converters/cuttinboardUserConverter";
import { employeeConverter } from "../models/converters/employeeConverter";
import { checkIfUserExistsByEmail } from "./auth";
import { sendWelcomeEmail } from "./emails";

type NewAdminUserArgs = {
  supervisingLocations: string[];
  name: string;
  lastName: string;
  email: string;
  organizationId: string;
  addedBy: string;
};

async function createNewSupervisor(
  employeeId: string,
  organizationId: string,
  supervisingLocations: string[],
  addedBy: string
) {
  // get user data
  const userSnap = await firestore()
    .collection("Users")
    .doc(employeeId)
    .withConverter(cuttinboardUserConverter)
    .get();
  const userData = userSnap.data();

  // throw error if user data not found
  if (!userData) {
    throw new https.HttpsError(
      "failed-precondition",
      "User's root document not found"
    );
  }

  // initialize batch write
  const batch = firestore().batch();

  const { name, lastName, phoneNumber, avatar, email } = userData;

  // create new employee object
  const newEmployeeToAdd: IOrganizationEmployee = {
    id: employeeId,
    name,
    lastName,
    phoneNumber,
    email,
    avatar,
    organizationId,
    role: RoleAccessLevels.ADMIN,
    supervisingLocations,
    createdAt: firestore.Timestamp.now().toMillis(),
    refPath: `Organizations/${organizationId}/employees/${employeeId}`,
  };

  // add new employee to organization
  batch.set(
    firestore()
      .collection("Organizations")
      .doc(organizationId)
      .collection("employees")
      .doc(employeeId),
    newEmployeeToAdd
  );

  // add employee as supervisor for each location
  for (const loc of supervisingLocations) {
    batch.update(firestore().collection("Locations").doc(loc), {
      supervisors: firestore.FieldValue.arrayUnion(employeeId),
    });
  }

  // update user document to add organization to list of organizations
  batch.update(firestore().collection("Users").doc(employeeId), {
    organizations: firestore.FieldValue.arrayUnion(organizationId),
  });

  // execute batch write
  await batch.commit();

  // send email to employee
  await sendWelcomeEmail(email, name, 11, {
    NAME: name,
    ADDED_BY: addedBy,
  });
}

async function updateEmployeeToSupervisor(
  existentEmployee: IEmployee,
  supervisingLocations: string[],
  addedBy: string
) {
  // initialize batch write to update employee and locations
  const batch = firestore().batch();

  // Create the new org employee
  const newEmployeeToAdd: IOrganizationEmployee = {
    id: existentEmployee.id,
    name: existentEmployee.name,
    lastName: existentEmployee.lastName,
    phoneNumber: existentEmployee.phoneNumber,
    email: existentEmployee.email,
    avatar: existentEmployee.avatar,
    organizationId: existentEmployee.organizationId,
    createdAt: firestore.Timestamp.now().toMillis(),
    refPath: `Organizations/${existentEmployee.organizationId}/employees/${existentEmployee.id}`,
    supervisingLocations,
    role: RoleAccessLevels.ADMIN,
  };

  // Add the new employee document to the organization's employee collection
  batch.set(firestore().doc(newEmployeeToAdd.refPath), newEmployeeToAdd);

  // Remove the old employee document from the location's employee collection
  batch.delete(firestore().doc(existentEmployee.refPath));

  // add employee as supervisor for each location
  for (const loc of supervisingLocations) {
    batch.update(firestore().collection("Locations").doc(loc), {
      supervisors: firestore.FieldValue.arrayUnion(existentEmployee.id),
    });
  }

  // execute batch write
  await batch.commit();

  const { name, email } = existentEmployee;

  // send email to employee
  await sendWelcomeEmail(email, name, 11, {
    NAME: name,
    ADDED_BY: addedBy,
  });
}

async function createNewUserAndSupervisor({
  name,
  lastName,
  email,
  organizationId,
  supervisingLocations,
  addedBy,
}: NewAdminUserArgs): Promise<string> {
  // generate random password for new user
  const randomPassword = Math.random().toString(36).slice(-8);

  // create new user
  const user = await auth().createUser({
    displayName: `${name} ${lastName}`,
    email,
    password: randomPassword,
  });

  // initialize batch write to add new employee and update locations
  const batch = firestore().batch();

  // add new user data
  batch.set(firestore().collection("Users").doc(user.uid), {
    name,
    lastName,
    email,
    organizations: [organizationId],
  });

  // data to add for new employee
  const newEmployeeData: IOrganizationEmployee = {
    id: user.uid,
    name,
    lastName,
    email,
    organizationId,
    role: RoleAccessLevels.ADMIN,
    supervisingLocations,
    createdAt: firestore.Timestamp.now().toMillis(),
    refPath: `Organizations/${organizationId}/employees/${user.uid}`,
  };

  // add new employee to organization
  batch.set(
    firestore()
      .collection("Organizations")
      .doc(organizationId)
      .collection("employees")
      .doc(user.uid),
    newEmployeeData
  );

  // add new employee as supervisor for each location
  for (const loc of supervisingLocations) {
    batch.update(firestore().collection("Locations").doc(loc), {
      supervisors: firestore.FieldValue.arrayUnion(user.uid),
    });
  }

  // execute batch write
  await batch.commit();

  // send welcome email to new user
  await sendWelcomeEmail(email, name, 10, {
    NAME: name,
    ADDED_BY: addedBy,
    PASSWORD: randomPassword,
  });

  // return new user's uid
  return user.uid;
}

export const inviteSupervisor = async ({
  supervisingLocations,
  name,
  lastName,
  email,
  organizationId,
  addedBy,
}: NewAdminUserArgs): Promise<
  | {
      status: "ADDED" | "CREATED" | "ALREADY_MEMBER";
      employeeId: string;
    }
  | undefined
> => {
  try {
    // check if user exists
    const userExists = await checkIfUserExistsByEmail(email);

    if (!userExists.exists) {
      // create new user and admin
      const employeeId = await createNewUserAndSupervisor({
        supervisingLocations,
        addedBy,
        name,
        lastName,
        email,
        organizationId,
      });
      return { status: "CREATED", employeeId };
    } else {
      // Check if the employee exists in the organization as member of any location
      const employeeSnap = await firestore()
        .collectionGroup("employees")
        .where("organizationId", "==", organizationId)
        .where("id", "==", userExists.uid)
        .withConverter(employeeConverter)
        .get();
      const employeeExists = employeeSnap.size > 0;

      if (employeeExists) {
        // If the employee exists, update the employee to be an admin
        const existentEmployee = employeeSnap.docs[0].data();
        const role = existentEmployee.role;

        if (role <= RoleAccessLevels.ADMIN) {
          throw new https.HttpsError(
            "failed-precondition",
            "Employee is already a supervisor"
          );
        }

        await updateEmployeeToSupervisor(
          existentEmployee,
          supervisingLocations,
          addedBy
        );
        return { status: "ALREADY_MEMBER", employeeId: userExists.uid };
      }

      // If the employee doesn't exist, create the employee and invite them
      await createNewSupervisor(
        userExists.uid,
        organizationId,
        supervisingLocations,
        addedBy
      );
      return { status: "ADDED", employeeId: userExists.uid };
    }
  } catch (error: any) {
    logger.error(error);
    throw new https.HttpsError("unknown", error.message);
  }
};
