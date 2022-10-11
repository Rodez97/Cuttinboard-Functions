import { database } from "firebase-admin";
import * as functions from "firebase-functions";
import { difference } from "lodash";

/**
 * Comprobar si hay cambios en los miembros de la conversación para eliminarlos o añadirlos a Realtime Database.
 */
export default functions.firestore
  .document("Organizations/{organizationId}/conversations/{conversationId}")
  .onUpdate(async (change, context) => {
    const { organizationId, conversationId } = context.params;
    const { members: bMembers } = change.before.data();
    const { locationId, members } = change.after.data();

    const membersToAdd = difference<string>(members ?? [], bMembers ?? []);
    const membersToRemove = difference<string>(bMembers ?? [], members ?? []);

    if (membersToAdd.length === 0 && membersToRemove.length === 0) {
      return;
    }

    const updates: { [key: string]: any } = {};

    for (const newMem of membersToAdd) {
      updates[
        `conversations/${organizationId}/${locationId}/${conversationId}/members/${newMem}`
      ] = newMem;
    }

    for (const oldMem of membersToRemove) {
      updates[
        `conversations/${organizationId}/${locationId}/${conversationId}/members/${oldMem}`
      ] = null;
      updates[
        `users/${oldMem}/notifications/organizations/${organizationId}/locations/${locationId}/conv`
      ] = null;
    }

    try {
      await database().ref().update(updates);
    } catch (error) {
      throw new Error("An error occurred updating this conversation");
    }
  });
