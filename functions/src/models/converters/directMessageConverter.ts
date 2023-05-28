import {
  IBoard,
  IConversation,
  IDirectMessage,
} from "@cuttinboard-solutions/types-helpers";
import {
  DocumentData,
  PartialWithFieldValue,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

export const directMessageConverter = {
  toFirestore(object: PartialWithFieldValue<IDirectMessage>): DocumentData {
    const { id, ...objectToSave } = object;
    return objectToSave;
  },
  fromFirestore(value: QueryDocumentSnapshot<IDirectMessage>): IDirectMessage {
    const { id } = value;
    const rawData = value.data();
    return {
      ...rawData,
      id,
    };
  },
};

export const conversationConverter = {
  toFirestore(object: PartialWithFieldValue<IConversation>): DocumentData {
    return object;
  },
  fromFirestore(value: QueryDocumentSnapshot<IConversation>): IConversation {
    return value.data();
  },
};

export const boardConverter = {
  toFirestore(object: PartialWithFieldValue<IBoard>): DocumentData {
    const { refPath, id, ...objectToSave } = object;
    return objectToSave;
  },
  fromFirestore(value: QueryDocumentSnapshot<IBoard>): IBoard {
    const { id, ref } = value;
    const rawData = value.data();
    return {
      ...rawData,
      id,
      refPath: ref.path,
    };
  },
};
