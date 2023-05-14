import {
  IBoard,
  IConversation,
  IDirectMessage,
} from "@cuttinboard-solutions/types-helpers";
import {
  DocumentData,
  QueryDocumentSnapshot,
  WithFieldValue,
} from "firebase-admin/firestore";

export const directMessageConverter = {
  toFirestore(object: IDirectMessage): DocumentData {
    return object;
  },
  fromFirestore(value: QueryDocumentSnapshot<IDirectMessage>): IDirectMessage {
    return value.data();
  },
};

export const conversationConverter = {
  toFirestore(object: IConversation): DocumentData {
    return object;
  },
  fromFirestore(value: QueryDocumentSnapshot<IConversation>): IConversation {
    return value.data();
  },
};

export const boardConverter = {
  toFirestore(object: WithFieldValue<IBoard>): DocumentData {
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
