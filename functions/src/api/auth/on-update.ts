import { ICuttinboardUser } from "@cuttinboard-solutions/types-helpers";
import { firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { directMessageConverter } from "../../models/converters/directMessageConverter";
import { locationConverter } from "../../models/converters/locationConverter";
import { employeeDocConverter } from "../../models/converters/employeeConverter";

/**
 * Update employee data on the locations or organizations when the user profile is updated
 */
export default functions.firestore
  .document(`/Users/{uid}`)
  .onUpdate(async (change, context) => {
    const { uid } = context.params;
    const bulkWriter = firestore().bulkWriter();

    // Extract the properties that we do not want to propagate to the locations or organizations
    const { customerId, subscriptionId, paymentMethods, ...afterEmployeeData } =
      change.after.data() as ICuttinboardUser;

    // Update the employee's profile on the locations
    await updateEmployeeLocationProfiles(uid, bulkWriter, afterEmployeeData);

    // Update the employee's profile on the organizations
    await updateEmployeeOrganizationsProfiles(
      uid,
      bulkWriter,
      afterEmployeeData
    );

    const { name, lastName, avatar } = change.before.data() as ICuttinboardUser;

    if (
      name !== afterEmployeeData.name ||
      lastName !== afterEmployeeData.lastName ||
      avatar !== afterEmployeeData.avatar
    ) {
      // Update the employee's profile on the direct messages
      await updateDMMember(uid, bulkWriter, afterEmployeeData);
    }

    try {
      // Commit the batch
      await bulkWriter.close();
    } catch (error: any) {
      functions.logger.error(error);
      throw new functions.https.HttpsError("unknown", error.message);
    }
  });

const updateEmployeeLocationProfiles = async (
  userId: string,
  bulkWriter: firestore.BulkWriter,
  afterEmployeeData: Partial<ICuttinboardUser>
) => {
  try {
    // Get the locations where the user is an employee
    const locations = await firestore()
      .collection("Locations")
      .where(`members`, "array-contains", userId)
      .withConverter(locationConverter)
      .get();

    if (locations.size > 0) {
      locations.forEach((ep) => {
        const employeesDocRef = ep.ref
          .collection("employees")
          .doc("employeesDocument")
          .withConverter(employeeDocConverter);
        // Update the employee profile on the locations
        bulkWriter.set(
          employeesDocRef,
          {
            employees: {
              [userId]: afterEmployeeData,
            },
          },
          { merge: true }
        );
      });
    }
  } catch (error: any) {
    functions.logger.error(error);
  }
};

const updateEmployeeOrganizationsProfiles = async (
  userId: string,
  bulkWriter: firestore.BulkWriter,
  afterEmployeeData: Partial<ICuttinboardUser>
) => {
  try {
    // Get the locations where the user is an employee
    const employeeOrganizationProfiles = await firestore()
      .collectionGroup("employees")
      .where(`id`, "==", userId)
      .get();

    if (employeeOrganizationProfiles.size > 0) {
      employeeOrganizationProfiles.forEach((ep) => {
        bulkWriter.set(ep.ref, afterEmployeeData, { merge: true });
      });
    }
  } catch (error: any) {
    functions.logger.error(error);
  }
};

const updateDMMember = async (
  userId: string,
  bulkWriter: firestore.BulkWriter,
  afterEmployeeData: Partial<ICuttinboardUser>
) => {
  const fullName = `${afterEmployeeData.name} ${afterEmployeeData.lastName}`;

  try {
    // Get the DM chats where the employee is involved
    const directMessagesSnap = await firestore()
      .collection("directMessages")
      .where(`members.${userId}._id`, "==", userId)
      .withConverter(directMessageConverter)
      .get();

    // Update the employee's name and avatar on the DM chats
    directMessagesSnap.forEach((dmSnap) =>
      bulkWriter.set(
        dmSnap.ref,
        {
          members: {
            [userId]: {
              _id: userId,
              name: fullName,
              avatar: afterEmployeeData.avatar,
            },
          },
        },
        { merge: true }
      )
    );
  } catch (error: any) {
    functions.logger.error(error);
  }
};
