import { ILocation } from "@rodez97/types-helpers";
import {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

export const locationConverter: FirestoreDataConverter<ILocation> = {
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
