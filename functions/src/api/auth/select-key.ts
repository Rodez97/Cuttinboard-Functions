import { auth, database, FirebaseError, firestore } from "firebase-admin";
import { https } from "firebase-functions";
import { EmployeeConverter } from "../../models/Employee";
import LocationKey from "../../models/LocationKey";
import OrganizationKey from "../../models/OrganizationKey";

/**
 * Select the Firestore key and add it to the custom Auth claims
 * @param {string} organizationId ID of the organization you want to select
 * @returns {IOrganizationKey} The selected key
 */
export default https.onCall(async (organizationId, context) => {
  const { auth: authentication } = context;

  if (!authentication) {
    throw new https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated!"
    );
  }

  // organizationId must be valid and type string
  if (!organizationId || typeof organizationId !== "string") {
    throw new https.HttpsError(
      "failed-precondition",
      "Missing <organizationId>"
    );
  }

  const { uid } = authentication;

  try {
    // Get the user's organization key
    const employeeProfileSnap = await firestore()
      .collection("Organizations")
      .doc(organizationId)
      .collection("employees")
      .doc(uid)
      .withConverter(EmployeeConverter)
      .get();
    const employeeProfile = employeeProfileSnap.data();
    if (!employeeProfile) {
      throw new https.HttpsError(
        "not-found",
        "The organization key does not exist"
      );
    }
    const { role, locations } = employeeProfile;

    let locKeys;
    if (role === "employee" && locations) {
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

    // Set the new key on the user's claims to grant access to the corresponding resources
    await auth().setCustomUserClaims(uid, { organizationKey });

    // Update the database in real time to notify the client to force the update.
    const metadataRef = database().ref(`users/${uid}/metadata`);

    // Set the update time to the current UTC timestamp.
    // This will be captured on the client to force a token refresh.
    await metadataRef.set({ refreshTime: new Date().getTime() });

    return { organizationKey };
  } catch (error) {
    const { code, message } = error as FirebaseError;
    throw new https.HttpsError("unknown", JSON.stringify({ code, message }));
  }
});
