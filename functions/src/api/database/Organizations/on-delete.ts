import { ILocation } from "@cuttinboard-solutions/types-helpers";
import { database, firestore } from "firebase-admin";
import { QueryDocumentSnapshot } from "firebase-admin/firestore";
import * as functions from "firebase-functions";
import { difference, uniq } from "lodash";
import { locationConverter } from "../../../models/converters/locationConverter";
import { deleteFiles } from "../../../services/deleteFiles";
import { deleteSubcollections } from "../../../services/deleteSubcollections";
import { handleError } from "../../../services/handleError";

export default functions.firestore
  .document("Organizations/{organizationId}")
  .onDelete(async (_, context) => {
    const { organizationId } = context.params;
    const bulkWriter = firestore().bulkWriter();

    // Initialize the organization document reference
    const updates: { [key: string]: null } = {};

    let members: string[] = [];
    let supervisors: string[] = [];
    let combinedMembers: string[] = [];

    // Delete locations and get the members and supervisors
    const membersAndSupervisors = await deleteLocAndGetMembers(
      organizationId,
      bulkWriter
    );

    members = membersAndSupervisors.membersList;
    supervisors = membersAndSupervisors.supervisorsList;
    combinedMembers = uniq([...members, ...supervisors]);

    combinedMembers.forEach((member) => {
      // Remove the organization from the members documents.
      bulkWriter.update(firestore().collection("Users").doc(member), {
        organizations: firestore.FieldValue.arrayRemove(organizationId),
      });

      // Remove the notifications related to the location
      updates[`users/${member}/notifications/organizations/${organizationId}`] =
        null;
    });

    try {
      // Apply the updates
      await database().ref().update(updates);

      // Commit the batch
      await bulkWriter.close();

      // Delete all the collections, subcollections and documents that belong to the organization.
      await deleteSubcollections(_.ref);

      // Delete the organization files from the storage
      await deleteFiles(`organizations/${organizationId}`);
    } catch (error) {
      handleError(error);
    }
  });

export const deleteLocAndGetMembers = (
  organizationId: string,
  bulkWriter: firestore.BulkWriter
) =>
  new Promise<{
    membersList: string[];
    supervisorsList: string[];
  }>((resolve) => {
    const locationsRef = firestore()
      .collection("Locations")
      .where("organizationId", "==", organizationId)
      .withConverter(locationConverter);

    let membersList: string[] = [];
    let supervisorsList: string[] = [];

    locationsRef
      .stream()
      .on("data", (documentSnapshot: QueryDocumentSnapshot<ILocation>) => {
        bulkWriter.delete(documentSnapshot.ref);

        const { members, supervisors } = documentSnapshot.data();

        if (members) {
          membersList = uniq([...membersList, ...members]);
        }

        if (supervisors) {
          supervisorsList = uniq([...supervisorsList, ...supervisors]);
        }
      })
      .on("end", () => {
        const membersNotSupervisors = difference(membersList, supervisorsList);
        resolve({ membersList: membersNotSupervisors, supervisorsList });
      });
  });
