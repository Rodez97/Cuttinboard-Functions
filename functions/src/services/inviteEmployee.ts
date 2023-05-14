import { auth, firestore } from "firebase-admin";
import { https } from "firebase-functions";
import { EmployeeData } from "../api/http/employees/create";
import { checkIfUserExistsByEmail } from "./auth";
import { sendWelcomeEmail } from "./emails";
import { handleError } from "./handleError";
import { IEmployee } from "@cuttinboard-solutions/types-helpers";
import { cuttinboardUserConverter } from "../models/converters/cuttinboardUserConverter";
import { locationConverter } from "../models/converters/locationConverter";
import { employeeDocConverter } from "../models/converters/employeeConverter";

type InviteEmpArgs = {
  organizationId: string;
  locationId: string;
} & EmployeeData;

type NewEmpUserArgs = {
  locationName: string;
} & InviteEmpArgs;

async function createNewUserAndEmployee({
  locationId,
  name,
  lastName,
  email,
  role,
  positions,
  wagePerPosition,
  mainPosition,
  organizationId,
  locationName,
  permissions,
}: NewEmpUserArgs): Promise<string> {
  // generate random password for new user
  const randomPassword = Math.random().toString(36).slice(-8);

  // create new user
  const user = await auth().createUser({
    displayName: `${name} ${lastName}`,
    email,
    password: randomPassword,
    emailVerified: true,
  });

  // initialize batch write to add new employee and update location
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
      organizations: [organizationId],
      organizationsRelationship: {
        [organizationId]: firestore.FieldValue.arrayUnion(locationId),
      },
    },
    { merge: true }
  );

  // data to add for new employee
  const newEmployeeData: IEmployee = {
    id: user.uid,
    name,
    lastName,
    email,
    organizationId,
    role,
    positions,
    startDate: firestore.Timestamp.now().toMillis(),
    mainPosition,
    wagePerPosition,
    createdAt: firestore.Timestamp.now().toMillis(),
    refPath: `Locations/${locationId}/employees/employeesDocument`,
    permissions,
  };

  // add new employee to organization
  batch.set(
    firestore().doc(`Locations/${locationId}/employees/employeesDocument`),
    { employees: { [newEmployeeData.id]: newEmployeeData } },
    { merge: true }
  );

  // add new employee as member of location
  batch.update(firestore().collection("Locations").doc(locationId), {
    members: firestore.FieldValue.arrayUnion(user.uid),
  });

  // execute batch write
  await batch.commit();

  // send welcome email to new user
  await sendWelcomeEmail(email, name, 1, {
    NAME: name,
    LOCATIONNAME: locationName,
    PASSWORD: randomPassword,
  });

  // return new user's uid
  return user.uid;
}

async function createNewEmployee(
  employeeId: string,
  locationName: string,
  empData: InviteEmpArgs
) {
  const userDocumentRef = firestore()
    .collection("Users")
    .doc(employeeId)
    .withConverter(cuttinboardUserConverter);
  // Get the data for the user with the provided employee ID
  const userSnap = await userDocumentRef.get();
  const userData = userSnap.data();

  // If the user data is not found, throw an error
  if (!userData) {
    throw new https.HttpsError(
      "failed-precondition",
      "User's root document not found"
    );
  }

  // Create a new firestore batch to perform multiple operations at once
  const batch = firestore().batch();

  // Destructure the user data
  const { name, lastName, phoneNumber, avatar, email } = userData;

  // Destructure the employee data
  const { organizationId, locationId, ...restData } = empData;

  // Create the data for the new employee document
  const newEmployeeToAdd: IEmployee = {
    id: employeeId,
    ...restData,
    name,
    lastName,
    phoneNumber,
    email,
    avatar,
    organizationId,
    startDate: firestore.Timestamp.now().toMillis(),
    createdAt: firestore.Timestamp.now().toMillis(),
    refPath: `Locations/${locationId}/employees/employeesDocument`,
  };

  // Add the new employee document to the organization's employee collection
  batch.set(
    firestore()
      .doc(newEmployeeToAdd.refPath)
      .withConverter(employeeDocConverter),
    { employees: { [newEmployeeToAdd.id]: newEmployeeToAdd } },
    { merge: true }
  );

  // add organization and location to user
  batch.update(userDocumentRef, {
    organizations: firestore.FieldValue.arrayUnion(organizationId),
    locations: firestore.FieldValue.arrayUnion(locationId),
    organizationsRelationship: {
      [organizationId]: firestore.FieldValue.arrayUnion(locationId),
    },
  });

  // Add the employee ID to the members array in the location document
  batch.update(firestore().collection("Locations").doc(locationId), {
    members: firestore.FieldValue.arrayUnion(employeeId),
  });

  // Commit the batch to apply all the changes at once
  await batch.commit();

  // Send a welcome email to the employee
  await sendWelcomeEmail(email, name, 3, {
    NAME: name,
    LOCATIONNAME: locationName,
  });
}

export const inviteEmployee = async (
  data: InviteEmpArgs
): Promise<
  | {
      status: "ADDED" | "CREATED" | "ALREADY_MEMBER" | "CANT_ADD_ORG_EMP";
      employeeId: string;
    }
  | undefined
> => {
  const {
    locationId,
    name,
    lastName,
    email,
    role,
    positions,
    wagePerPosition,
    mainPosition,
    organizationId,
    permissions,
  } = data;
  try {
    // Check if the location exists
    const location = await firestore()
      .collection("Locations")
      .doc(locationId)
      .withConverter(locationConverter)
      .get();
    const locationData = location.data();

    if (!locationData) {
      throw new https.HttpsError("failed-precondition", "Location not found");
    }

    const { name: locationName, members, limits } = locationData;
    const membersCount = members ? members.length : 0;

    if (membersCount === limits.employees) {
      throw new https.HttpsError(
        "failed-precondition",
        "You have reached the maximum number of employees for this location"
      );
    }

    const userExists = await checkIfUserExistsByEmail(email);
    if (!userExists.exists) {
      // If the user is not present in the system then create a new user and employee.
      const employeeId = await createNewUserAndEmployee({
        name,
        email,
        lastName,
        organizationId,
        locationId,
        role,
        positions,
        mainPosition,
        wagePerPosition,
        locationName,
        permissions,
      });
      return { status: "CREATED", employeeId };
    } else {
      // Try to get the employee document
      const employeeSnap = await firestore()
        .collection("Locations")
        .doc(locationId)
        .collection("employees")
        .doc("employeesDocument")
        .get();

      if (
        employeeSnap.exists &&
        employeeSnap.data()?.employees?.[userExists.uid]
      ) {
        // If the employee document exists then the user is already a member of the location. Throw an error.
        throw new https.HttpsError(
          "failed-precondition",
          "The user is already a member of this location"
        );
      }

      // If the user is present in the system but not as an employee then add the user as an employee.
      await createNewEmployee(userExists.uid, locationName, data);
      return { status: "ADDED", employeeId: userExists.uid };
    }
  } catch (error) {
    handleError(error);
    return;
  }
};
