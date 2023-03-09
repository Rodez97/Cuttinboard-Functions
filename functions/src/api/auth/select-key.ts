import { IOrganizationKey } from "@cuttinboard-solutions/types-helpers";
import { auth, firestore } from "firebase-admin";
import { https } from "firebase-functions";
import { isEmpty } from "lodash";
import {
  employeeConverter,
  orgEmployeeConverter,
} from "../../models/converters/employeeConverter";
import { handleError } from "../../services/handleError";

interface SelectKeyData {
  organizationId: string;
  locationId: string;
}

/**
 * Select a key for a user to access a location or organization.
 */
export default https.onCall(
  async ({ organizationId, locationId }: SelectKeyData, context) => {
    const authentication = context.auth;

    // Check that the user is authenticated.
    if (!authentication) {
      throw new https.HttpsError(
        "unauthenticated",
        "The function must be called while authenticated."
      );
    }

    // Organization ID is required and must be a string.
    if (!organizationId || typeof organizationId !== "string") {
      throw new https.HttpsError(
        "invalid-argument",
        "A valid organization ID is required as input to this function. The organization ID must be a string."
      );
    }

    // Location ID is required and must be a string.
    if (!locationId || typeof locationId !== "string") {
      throw new https.HttpsError(
        "invalid-argument",
        "A valid location ID is required as input to this function. The location ID must be a string."
      );
    }

    // Get the user's ID.
    const { uid } = authentication;

    let organizationKey: IOrganizationKey | undefined;

    try {
      // Get the user's organization key
      const employeeOrganizationProfileSnap = await firestore()
        .collection("Organizations")
        .doc(organizationId)
        .collection("employees")
        .doc(uid)
        .withConverter(orgEmployeeConverter)
        .get();
      const employeeOrganizationProfile =
        employeeOrganizationProfileSnap.data();

      if (employeeOrganizationProfile) {
        // Get the organization Data
        const { role } = employeeOrganizationProfile;

        organizationKey = {
          role,
          orgId: organizationId,
          locId: locationId,
        };
      } else {
        // Get the user's organization key
        const employeeLocationProfileSnap = await firestore()
          .collection("Locations")
          .doc(locationId)
          .collection("employees")
          .doc(uid)
          .withConverter(employeeConverter)
          .get();
        const employeeLocationProfile = employeeLocationProfileSnap.data();

        if (!employeeLocationProfile) {
          // Throw an error if the user does not have access to the location
          throw new https.HttpsError(
            "failed-precondition",
            "The user does not have access to the location."
          );
        }

        const { role, positions } = employeeLocationProfile;

        organizationKey = {
          role,
          pos: positions,
          orgId: organizationId,
          locId: locationId,
        };
      }

      if (!organizationKey || isEmpty(organizationKey)) {
        throw new https.HttpsError(
          "failed-precondition",
          "The user does not have access to the location."
        );
      }

      // Set the new key on the user's claims to grant access to the corresponding resources
      await auth().setCustomUserClaims(uid, { organizationKey });

      // Return the result to the client.
      return { organizationKey };
    } catch (error) {
      handleError(error);
      return;
    }
  }
);
