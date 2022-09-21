/**
 * Atributos primarios de cualquier documento de **Firebase**
 */

import { firestore } from "firebase-admin";

export type PrimaryFirestore = {
  /**
   * ID del documento
   */
  id: string;
  /**
   * Referencia del documento en Firestore
   */
  docRef: firestore.DocumentReference<firestore.DocumentData>;
};
