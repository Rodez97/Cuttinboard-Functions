import {
  IOrganizationEmployee,
  RoleAccessLevels,
} from "@cuttinboard-solutions/types-helpers";
import { auth, firestore } from "firebase-admin";
import { https, logger } from "firebase-functions";
import { cuttinboardUserConverter } from "../models/converters/cuttinboardUserConverter";
import { locationConverter } from "../models/converters/locationConverter";
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
  addedBy: string,
  batch: firestore.WriteBatch
) {
  const userDocumentRef = firestore()
    .collection("Users")
    .doc(employeeId)
    .withConverter(cuttinboardUserConverter);
  // get user data
  const userSnap = await userDocumentRef.get();
  const userData = userSnap.data();

  // throw error if user data not found
  if (!userData) {
    throw new https.HttpsError(
      "failed-precondition",
      "User's root document not found"
    );
  }

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

  // execute batch write
  await batch.commit();

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
    emailVerified: true,
  });

  // initialize batch write to add new employee and update locations
  const batch = firestore().batch();

  // add new user data
  batch.set(
    firestore()
      .collection("Users")
      .doc(user.uid)
      .withConverter(cuttinboardUserConverter),
    {
      name,
      lastName,
      email,
    },
    { merge: true }
  );

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
}: NewAdminUserArgs): Promise<{
  status: "ADDED" | "CREATED";
  employeeId: string;
}> => {
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
        .collection("Locations")
        .where("organizationId", "==", organizationId)
        .where("members", "array-contains", userExists.uid)
        .withConverter(locationConverter)
        .get();

      // Initialize batch write
      const batch = firestore().batch();

      if (employeeSnap.size > 0) {
        // If the employee exists as a member of any location, remove them from the location employee collection and member array
        employeeSnap.forEach((locationDoc) => {
          batch.update(locationDoc.ref, {
            members: firestore.FieldValue.arrayRemove(userExists.uid),
          });
          batch.set(
            locationDoc.ref.collection("employees").doc("employeesDocument"),
            {
              employees: {
                [userExists.uid]: firestore.FieldValue.delete(),
              },
            },
            { merge: true }
          );
        });
      }

      // Create the new supervisor
      await createNewSupervisor(
        userExists.uid,
        organizationId,
        supervisingLocations,
        addedBy,
        batch
      );
      return { status: "ADDED", employeeId: userExists.uid };
    }
  } catch (error: any) {
    logger.error(error);
    throw new https.HttpsError("unknown", error.message);
  }
};
