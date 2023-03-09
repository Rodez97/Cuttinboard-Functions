import { Organization } from "@cuttinboard-solutions/types-helpers";
import {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

/**
 * Organization Firestore Data Converter
 */
export const organizationConverter: FirestoreDataConverter<Organization> = {
  toFirestore: (organization: Organization) => organization,
  fromFirestore: (snapshot: QueryDocumentSnapshot<Organization>) =>
    snapshot.data(),
};
