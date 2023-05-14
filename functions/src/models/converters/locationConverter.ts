import { ILocation } from "@cuttinboard-solutions/types-helpers";
import { DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";

export const locationConverter = {
  toFirestore(object: ILocation): DocumentData {
    const { refPath, id, ...objectToSave } = object;
    return objectToSave;
  },
  fromFirestore(value: QueryDocumentSnapshot<ILocation>): ILocation {
    const { id, ref } = value;
    const rawData = value.data();
    return {
      ...rawData,
      id,
      refPath: ref.path,
    };
  },
};
