import { ICuttinboardUser } from "@cuttinboard-solutions/types-helpers";
import { firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { directMessageConverter } from "../../../models/converters/directMessageConverter";
import { handleError } from "../../../services/handleError";

/**
 * Update employee data on the locations or organizations when the user profile is updated
 */
export default functions.firestore
  .document(`/Users/{uid}`)
  .onUpdate(async (change, context) => {
    const { uid } = context.params;
    const batch = firestore().batch();

    // Extract the properties that we do not want to propagate to the locations or organizations
    const {
      customerId,
      subscriptionId,
      paymentMethods,
      organizations,
      ...afterEmployeeData
    } = change.after.data() as ICuttinboardUser;

    if (organizations) {
      organizations.forEach((org: string) => {
        // Update the employee profile on the locations
        batch.update(
          firestore()
            .collection("Organizations")
            .doc(org)
            .collection("employees")
            .doc(uid),
          afterEmployeeData
        );
      });
    }

    const { name, lastName, avatar } = change.before.data() as ICuttinboardUser;

    if (
      name !== afterEmployeeData.name ||
      lastName !== afterEmployeeData.lastName ||
      avatar !== afterEmployeeData.avatar
    ) {
      // ! If the name, lastName or avatar has changed then update the DM chats where the employee is involved

      const fullName = `${afterEmployeeData.name} ${afterEmployeeData.lastName}`;

      // Get the DM chats where the employee is involved
      const directMessagesSnap = await firestore()
        .collection("DirectMessages")
        .where("membersList", "array-contains", uid)
        .withConverter(directMessageConverter)
        .get();

      // Update the employee's name and avatar on the DM chats
      directMessagesSnap.forEach((dmSnap) =>
        batch.set(
          dmSnap.ref,
          {
            members: {
              [uid]: {
                id: uid,
                name: fullName,
                avatar: afterEmployeeData.avatar,
              },
            },
          },
          { merge: true }
        )
      );
    }

    try {
      // Commit the batch
      await batch.commit();
    } catch (error) {
      handleError(error);
    }
  });
