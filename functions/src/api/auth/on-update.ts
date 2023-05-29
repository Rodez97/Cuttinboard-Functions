import { ICuttinboardUser } from "@cuttinboard-solutions/types-helpers";
import { firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import {
  conversationConverter,
  directMessageConverter,
} from "../../models/converters/directMessageConverter";
import {
  employeeDocConverter,
  orgEmployeeConverter,
} from "../../models/converters/employeeConverter";
import { isEqual } from "lodash";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { locationConverter } from "../../models/converters/locationConverter";

/**
 * Update employee data on the locations or organizations when the user profile is updated
 */
export default onDocumentUpdated(`/Users/{uid}`, async (event) => {
  const { uid } = event.params;

  const {
    customerId: bCustomerId,
    subscriptionId: bSubscriptionId,
    paymentMethods: bPaymentMethods,
    organizations: bOrganizations,
    locations: bLocations,
    organizationsRelationship: bOrganizationsRelationship,
    ...bAfterEmployeeData
  } = event.data?.before.data() as ICuttinboardUser;

  // Extract the properties that we do not want to propagate to the locations or organizations
  const {
    customerId,
    subscriptionId,
    paymentMethods,
    organizations,
    locations,
    organizationsRelationship,
    ...afterEmployeeData
  } = event.data?.after.data() as ICuttinboardUser;

  // If the employee data has not changed, return
  if (isEqual(bAfterEmployeeData, afterEmployeeData)) {
    return;
  }

  const bulkWriter = firestore().bulkWriter();

  // Update the employee's profile on the locations
  await updateEmployeeLocationProfiles(uid, bulkWriter, afterEmployeeData);

  // Update the employee's profile on the organizations
  await updateEmployeeOrganizationsProfiles(uid, bulkWriter, afterEmployeeData);

  const { name, lastName, avatar } = bAfterEmployeeData;

  if (
    name !== afterEmployeeData.name ||
    lastName !== afterEmployeeData.lastName ||
    avatar !== afterEmployeeData.avatar
  ) {
    // Update the employee's profile on the direct messages
    await updateDMMember(uid, bulkWriter, afterEmployeeData);
    // Update the employee's profile on the conversations
    await updateConversationMember(uid, bulkWriter, afterEmployeeData);
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
  const query = firestore()
    .collection("Locations")
    .where("members", "array-contains", userId)
    .withConverter(locationConverter);

  const locations = await query.get();

  if (locations.empty) {
    // If the user is not an employee of any location, return
    return;
  }

  locations.forEach((location) => {
    const employeesDocRef = location.ref
      .collection("employees")
      .doc("employeesDocument")
      .withConverter(employeeDocConverter);
    // If the employee has a profile on the location, update it
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
};

const updateEmployeeOrganizationsProfiles = async (
  userId: string,
  bulkWriter: firestore.BulkWriter,
  afterEmployeeData: Partial<ICuttinboardUser>
) => {
  const query = firestore()
    .collectionGroup("employees")
    .where("id", "==", userId)
    .withConverter(orgEmployeeConverter);

  const organizationsEmployees = await query.get();

  if (organizationsEmployees.empty) {
    // If the user is not an employee of any organization, return
    return;
  }

  organizationsEmployees.forEach((organizationEmp) => {
    // If the employee has a profile on the organization, update it
    bulkWriter.set(organizationEmp.ref, afterEmployeeData, { merge: true });
  });
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
      bulkWriter.update(dmSnap.ref, {
        [`members.${userId}`]: {
          _id: userId,
          name: fullName,
          avatar: afterEmployeeData.avatar,
        },
      })
    );
  } catch (error: any) {
    functions.logger.error(error);
  }
};

const updateConversationMember = async (
  userId: string,
  bulkWriter: firestore.BulkWriter,
  afterEmployeeData: Partial<ICuttinboardUser>
) => {
  const fullName = `${afterEmployeeData.name} ${afterEmployeeData.lastName}`;

  try {
    // Get all conversations that the employee is a member of
    const conversations = await firestore()
      .collection("conversations")
      .where(`members.${userId}.muted`, "in", [true, false])
      .withConverter(conversationConverter)
      .get();

    if (conversations.empty) {
      return;
    }

    // Update the employee's name and avatar on the conversations
    conversations.forEach((conversation) => {
      const reference = firestore()
        .collection("conversations")
        .doc(conversation.id);
      bulkWriter.update(reference, {
        [`members.${userId}.name`]: fullName,
        [`members.${userId}.avatar`]: afterEmployeeData.avatar,
      });
    });
  } catch (error: any) {
    functions.logger.error(error);
  }
};
