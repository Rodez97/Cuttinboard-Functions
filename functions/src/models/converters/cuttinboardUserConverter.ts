import { ICuttinboardUser } from "@rodez97/types-helpers";
import {
  DocumentData,
  PartialWithFieldValue,
  QueryDocumentSnapshot,
  FirestoreDataConverter,
} from "firebase-admin/firestore";

export const cuttinboardUserConverter: FirestoreDataConverter<ICuttinboardUser> =
  {
    toFirestore(object: PartialWithFieldValue<ICuttinboardUser>): DocumentData {
      const { refPath, id, ...objectToSave } = object;
      return objectToSave;
    },
    fromFirestore(
      value: QueryDocumentSnapshot<ICuttinboardUser>
    ): ICuttinboardUser {
      const { id, ref } = value;
      const rawData = value.data();
      return {
        ...rawData,
        id,
        refPath: ref.path,
      };
    },
  };
