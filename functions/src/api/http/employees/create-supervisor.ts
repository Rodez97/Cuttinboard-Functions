import { firestore } from "firebase-admin";
import { inviteSupervisor } from "../../../services/inviteSupervisor";
import { HttpsError, onCall } from "firebase-functions/v2/https";

export interface EmployeeData {
  name: string;
  lastName: string;
  email: string;
  supervisingLocations?: string[];
}

/**
 * Add a new employee to the organization or location
 */
export default onCall<EmployeeData>(async (request) => {
  const { auth, data } = request;

  if (!auth) {
    // If the user is not authenticated then return an error
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  // Employee registration data
  const { name, lastName, email, supervisingLocations } = data;

  if (!name || !lastName || !email) {
    // If the required data is not provided then return an error
    throw new HttpsError(
      "invalid-argument",
      "The function must be called with valid data."
    );
  }

  if (email === auth.token.email) {
    // If the user is trying to add himself then return an error
    throw new HttpsError(
      "invalid-argument",
      "You can not add yourself as an employee."
    );
  }

  // Lower case the email
  const loweredEmail = email.toLowerCase();

  // Get the organization data (Only the owner can add employees as supervisors)
  const userOrg = await firestore()
    .collection("Organizations")
    .doc(auth.uid)
    .get();
  const organizationData = userOrg.data();

  if (!organizationData) {
    // If the organization does not exist then return an error
    throw new HttpsError(
      "failed-precondition",
      "The organization does not exist."
    );
  }

  if (organizationData.subscriptionStatus === "canceled") {
    // If the subscription is canceled then return an error
    throw new HttpsError(
      "failed-precondition",
      "The organization's subscription is canceled."
    );
  }

  // Get the name of the user that is inviting the supervisor, in this case the owner of the organization.
  // ? If there is no name then use the email.
  const addedBy: string = auth.token["name"] ?? auth.token.email ?? "Anonymous";

  // Invite the supervisor
  const result = await inviteSupervisor({
    name,
    lastName,
    email: loweredEmail,
    organizationId: auth.uid,
    supervisingLocations: supervisingLocations ?? [],
    addedBy,
  });

  return result;
});
