import { database, firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { deleteFiles } from "../../../services/deleteFiles";
import { difference } from "lodash";
import { GrpcStatus } from "firebase-admin/firestore";
import { ILocation } from "@cuttinboard-solutions/types-helpers";

/**
 * Clean the location data from the organization
 */
export default functions.firestore
  .document(`/Locations/{locationId}`)
  .onDelete(async (change, context) => {
    const { locationId } = context.params;

    // Get the location data
    const { organizationId, supervisors, members } = change.data() as ILocation;

    // Initialize the organization document reference
    const updates: { [key: string]: null } = {};

    // Initialize the updates batch
    const bulkWriter = firestore().bulkWriter();

    bulkWriter.onWriteError((error) => {
      if (error.code === GrpcStatus.NOT_FOUND) {
        functions.logger.log(
          "Document does not exist: ",
          error.documentRef.path
        );
        return false;
      }
      if (error.failedAttempts < 10) {
        return true;
      } else {
        return false;
      }
    });

    // Organization employees reference
    const employeesRef = firestore()
      .collection("Organizations")
      .doc(organizationId)
      .collection("employees");

    const membersNotSupervisors = difference(members ?? [], supervisors ?? []);

    /**
     * Remove the location from each supervisor
     */
    supervisors?.forEach((supervisor) => {
      bulkWriter.update(employeesRef.doc(supervisor), {
        supervisingLocations: firestore.FieldValue.arrayRemove(locationId),
        locationsList: firestore.FieldValue.arrayRemove(locationId),
      });

      updates[
        `users/${supervisor}/notifications/organizations/${organizationId}/locations/${locationId}`
      ] = null;
    });

    /**
     * Delete the data related to the location from each employee
     */
    membersNotSupervisors.forEach((member) => {
      bulkWriter.update(employeesRef.doc(member), {
        [`locations.${locationId}`]: firestore.FieldValue.delete(),
        locationsList: firestore.FieldValue.arrayRemove(locationId),
      });

      updates[
        `users/${member}/notifications/organizations/${organizationId}/locations/${locationId}`
      ] = null;
    });

    // Decrease the locations count by one and update the organization
    bulkWriter.update(
      firestore().collection("Organizations").doc(organizationId),
      {
        locations: firestore.FieldValue.increment(-1),
      }
    );

    try {
      await firestore().recursiveDelete(change.ref, bulkWriter);
    } catch (error) {
      functions.logger.error(
        "Error deleting location data from Firestore",
        error
      );
    }

    await deleteFiles(
      `organizations/${organizationId}/locations/${locationId}`
    );

    try {
      // Apply the updates
      await database().ref().update(updates);
    } catch (error) {
      functions.logger.error("Error deleting location data from RTDB", error);
    }
  });
