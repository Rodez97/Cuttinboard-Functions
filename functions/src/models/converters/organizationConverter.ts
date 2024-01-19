import { Organization } from "@rodez97/types-helpers";
import {
  FirestoreDataConverter,
  PartialWithFieldValue,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

/**
 * Organization Firestore Data Converter
 */
export const organizationConverter: FirestoreDataConverter<Organization> = {
  toFirestore: (organization: PartialWithFieldValue<Organization>) =>
    organization,
  fromFirestore: (snapshot: QueryDocumentSnapshot<Organization>) =>
    snapshot.data(),
};
