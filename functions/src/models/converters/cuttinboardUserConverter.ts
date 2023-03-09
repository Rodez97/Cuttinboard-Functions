import { ICuttinboardUser } from "@cuttinboard-solutions/types-helpers";
import { DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";

export const cuttinboardUserConverter = {
  toFirestore(object: ICuttinboardUser): DocumentData {
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
