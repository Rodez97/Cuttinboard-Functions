import { firestore } from "firebase-admin";
import { PrimaryFirestore } from "./PrimaryFirestore";

export default <
  T extends PrimaryFirestore
>(): firestore.FirestoreDataConverter<T> => ({
  toFirestore(object: T): firestore.DocumentData {
    const { docRef, id, ...objectToSave } = object;
    return objectToSave;
  },
  fromFirestore(snapshot: firestore.QueryDocumentSnapshot<T>): T {
    const data = snapshot.data()!;
    return {
      ...data,
      id: snapshot.id,
      docRef: snapshot.ref,
    };
  },
});
