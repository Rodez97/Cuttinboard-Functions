import { database, FirebaseError, firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { differenceBy, isEqual } from "lodash";
import LocationKey from "../../../../models/LocationKey";
import OrganizationKey from "../../../../models/OrganizationKey";
import { updateUserClaims } from "../../../../services/auth";
import { updateEmployeeConversations } from "../../../../services/employees";

export default functions.firestore
  .document("/Organizations/{organizationId}/employees/{employeeId}")
  .onUpdate(async (snapshot, context) => {
    const { organizationId, employeeId } = context.params;
    const { locations: bLocations, role: bRole } = snapshot.before.data();
    const { locations, role } = snapshot.after.data();

    if (isEqual(bLocations, locations) && bRole === role) {
      return;
    }

    const batch = firestore().batch();

    const beforeLocKeys: [string, boolean | LocationKey][] = bLocations
      ? Object.entries(bLocations)
      : [];
    const afterLocKeys: [string, boolean | LocationKey][] = locations
      ? Object.entries(locations)
      : [];

    const oldLocations = differenceBy(
      beforeLocKeys,
      afterLocKeys,
      ([key]) => key
    );

    const newLocations = differenceBy(
      afterLocKeys,
      beforeLocKeys,
      ([key]) => key
    );

    function isEmployee(
      locations: Record<string, boolean | LocationKey>
    ): locations is Record<string, LocationKey> {
      return role === "employee";
    }

    const updates: { [key: string]: any } = {};

    for (const [locId] of oldLocations) {
      batch.update(firestore().collection("Locations").doc(locId), {
        members: firestore.FieldValue.arrayRemove(employeeId),
      });
      updates[`users/${employeeId}/notifications/${locId}`] = null;
    }
    for (const [locId] of newLocations) {
      batch.update(firestore().collection("Locations").doc(locId), {
        members: firestore.FieldValue.arrayUnion(employeeId),
      });
    }

    let locKeys;
    if (isEmployee(locations)) {
      locKeys = Object.entries(locations).reduce<{
        [locId: string]: LocationKey;
      }>(
        (acc, [locId, empLoc]) => ({
          ...acc,
          [locId]: { locId, role: empLoc.role, pos: empLoc.pos },
        }),
        {}
      );
    }

    const organizationKey: OrganizationKey = {
      orgId: organizationId,
      role,
      locKeys,
    };

    try {
      await batch.commit();
      await database().ref().update(updates);
      await updateEmployeeConversations(
        organizationId,
        employeeId,
        bLocations,
        locations
      );
      await updateUserClaims(employeeId, organizationKey);
    } catch (error) {
      const { code, message } = error as FirebaseError;
      throw new functions.https.HttpsError(
        "failed-precondition",
        JSON.stringify({ code, message })
      );
    }
  });
