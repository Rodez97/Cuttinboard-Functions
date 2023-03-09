import {
  IConversation,
  IEmployee,
  IOrganizationKey,
  PrivacyLevel,
} from "@cuttinboard-solutions/types-helpers";
import { auth, database, firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { difference, isEqual } from "lodash";
import { handleError } from "../../../../services/handleError";
import { updateUserMetadata } from "../../../../services/updateUserMetadata";

export default functions.firestore
  .document("/Locations/{locationId}/employees/{employeeId}")
  .onUpdate(async (snapshot, context) => {
    const { locationId, employeeId } = context.params;

    const beforeEmployee = snapshot.before.data() as IEmployee;
    const afterEmployee = snapshot.after.data() as IEmployee;

    // Get the employee data before the update (b prefix stands for before).
    const {
      positions: bPositions,
      role: bRole,
      organizationId,
    } = beforeEmployee;

    // Get the employee data after the update.
    const { positions, role } = afterEmployee;

    const afterPositions = positions ?? [];
    const beforePositions = bPositions ?? [];

    if (isEqual(afterPositions, beforePositions) && bRole === role) {
      // If the employee's positions have not changed, continue
      return;
    }

    try {
      if (!isEqual(afterPositions, beforePositions)) {
        // Create a batch
        const bulkWriter = firestore().bulkWriter();
        // Initialize the updates object
        const realtimeDatabaseUpdates: { [key: string]: null } = {};

        const addedPositions = difference(afterPositions, beforePositions);
        const removedPositions = difference(beforePositions, afterPositions);

        // If the employee has been added to any positions, add them to the relevant conversations
        if (addedPositions.length > 0) {
          await processAddedPositions(
            employeeId,
            locationId,
            addedPositions,
            bulkWriter
          );
        }

        // If the employee has been removed from any positions, remove them from the relevant conversations
        if (removedPositions.length > 0) {
          await processRemovedPositions(
            employeeId,
            locationId,
            removedPositions,
            bulkWriter,
            realtimeDatabaseUpdates,
            organizationId
          );
        }

        // Commit the batch
        await bulkWriter.close();

        // Apply the updates to the database
        if (Object.keys(realtimeDatabaseUpdates).length > 0) {
          await database().ref().update(realtimeDatabaseUpdates);
        }
      }

      await updateClaims(afterEmployee, locationId);
    } catch (error) {
      handleError(error);
    }
  });

async function updateClaims(employeeData: IEmployee, locationId: string) {
  const { customClaims } = await auth().getUser(employeeData.id);
  if (!customClaims) {
    // If the user doesn't have any claims, we don't need to update them
    return;
  }
  const organizationKey: IOrganizationKey | undefined =
    customClaims.organizationKey;
  if (!organizationKey) {
    // If the user doesn't have any organization key or the organization key is the same, we don't need to update it
    return;
  }

  const { orgId, locId } = organizationKey;

  if (locId !== locationId) {
    // If the location id is not the same, we don't need to update the claims
    return;
  }

  // Create the new organization key for the user
  const newOrganizationKey: IOrganizationKey = {
    orgId,
    locId,
    role: employeeData.role,
    pos: employeeData.positions ?? [],
  };

  if (isEqual(organizationKey, newOrganizationKey)) {
    // If the keys are the same, we don't need to update the claims
    return;
  }

  // Update the user's claims
  await auth().setCustomUserClaims(employeeData.id, {
    organizationKey: newOrganizationKey,
  });

  // Update the user's claims in the database
  await updateUserMetadata(employeeData.id);
}

async function processAddedPositions(
  employeeId: string,
  locationId: string,
  addedPositions: string[],
  batch: firestore.BulkWriter
) {
  try {
    const conversations = await firestore()
      .collection("Locations")
      .doc(locationId)
      .collection("conversations")
      .where("privacyLevel", "==", PrivacyLevel.POSITIONS)
      .where("position", "in", addedPositions)
      .get();

    if (!conversations.empty) {
      conversations.forEach((conversation) => {
        batch.update(conversation.ref, {
          members: firestore.FieldValue.arrayUnion(employeeId),
        });
      });
    }
  } catch (error) {
    functions.logger.error(error);
  }
}

async function processRemovedPositions(
  employeeId: string,
  locationId: string,
  removedPositions: string[],
  batch: firestore.BulkWriter,
  realtimeUpdates: { [key: string]: null },
  organizationId: string
) {
  try {
    const conversations = await firestore()
      .collection("Locations")
      .doc(locationId)
      .collection("conversations")
      .where("privacyLevel", "==", PrivacyLevel.POSITIONS)
      .where("position", "in", removedPositions)
      .get();

    if (!conversations.empty) {
      conversations.forEach((conversation) => {
        const { hosts } = conversation.data() as IConversation;

        if (!hosts?.includes(employeeId)) {
          batch.update(conversation.ref, {
            members: firestore.FieldValue.arrayRemove(employeeId),
            muted: firestore.FieldValue.arrayRemove(employeeId),
          });

          realtimeUpdates[
            `/users/${employeeId}/notifications/organizations/${organizationId}/locations/${locationId}/conv/${conversation.id}`
          ] = null;
        }
      });
    }
  } catch (error) {
    functions.logger.error(error);
  }
}
