import { IDirectMessage } from "@cuttinboard-solutions/types-helpers";
import { DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";

export const directMessageConverter = {
  toFirestore(object: IDirectMessage): DocumentData {
    const { refPath, id, ...objectToSave } = object;
    return objectToSave;
  },
  fromFirestore(value: QueryDocumentSnapshot<IDirectMessage>): IDirectMessage {
    const { id, ref } = value;
    const rawData = value.data();
    return {
      ...rawData,
      id,
      refPath: ref.path,
    };
  },
};
