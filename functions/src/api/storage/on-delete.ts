import { FirebaseError, firestore } from "firebase-admin";
import * as functions from "firebase-functions";
/**
 * Controlar la eliminación de archivos al almacenamiento de la locación para:
 * - Actualizar el total de almacenamiento consumido por la locación.
 */
export default functions.storage.object().onDelete(async (object) => {
  // Ruta de almacenamiento del archivo
  const filePath = object.name;
  // Tamaño del archivo en bytes
  const fileSize = Number(object.size);
  // Regex para comprobar la ruta del archivo subido.
  const regexPath =
    /^organizations\/(\w+)\/locations\/([A-z0-9-]+)\/storage\/(\w+)\/(\w+.\w{1,4})/i;
  // Comprobar que la ruta del archivo sea válida y corresponda al espacio de almacenamiento de una locación
  if (!filePath || !regexPath.test(filePath)) {
    return;
  }
  // Tratar de extraer las variables necesarias de la ruta de almacenamiento.
  const matches = filePath.match(regexPath);
  // Comprobar si las variables son válidas
  if (!matches) {
    throw new Error("Failed to extract required variables from storage path");
  }
  const locationId = matches[2];
  const locationDocRef = firestore().doc(`Locations/${locationId}`);

  try {
    // Restar el tamaño del archivo al total de capacidad consumida por la locación
    await locationDocRef.update({
      storageUsed: firestore.FieldValue.increment(-fileSize),
    });
  } catch (error) {
    const { code, message } = error as FirebaseError;
    throw new functions.https.HttpsError(
      "failed-precondition",
      JSON.stringify({ code, message })
    );
  }
});
