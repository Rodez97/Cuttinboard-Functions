import { FirebaseError, firestore, storage } from "firebase-admin";
import * as functions from "firebase-functions";
/**
 * Controlar la subida de archivos al almacenamiento de la locación para:
 * - Verificar que no se supera el límite de almacenamiento.
 * - Actualizar el total de almacenamiento consumido por la locación.
 */
export default functions.storage.object().onFinalize(async (object) => {
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
  const organizationId = matches[1];
  const locationId = matches[2];
  const drawerId = matches[3];
  const filename = matches[4];
  const locationDocRef = firestore().doc(`Locations/${locationId}`);

  try {
    // Ejecutar una operación de transacción que nos permita controlar el espacio de
    // almacenamiento usado y el límite máximo de almacenamiento en dependencia de su plan
    await firestore().runTransaction(async (transaction) => {
      const locationDoc = await transaction.get(locationDocRef);
      // Comprobar que la locación exista
      if (!locationDoc.exists) {
        throw "Document does not exist!";
      }
      const locationData = locationDoc.data();
      if (!locationData) {
        throw "Document does not exist!";
      }
      // Comprobar que el espacio de almacenamiento de la locación no se ha superado
      const { storageUsed, limits } = locationData;
      const locationStorageUsage = Number(storageUsed);
      const locationStorageLimit = Number(limits.storage);
      // Comprobar que al añadir el nuevo archivo no se supere el límite de almacenamiento
      if (locationStorageUsage + fileSize > locationStorageLimit) {
        // Obtener el id del archivo
        const fileId = filename.split(".")[0];
        // Eliminar el archivo del almacenamiento
        await storage().bucket().file(filePath).delete();
        // Borrar el archivo del registro de su drawer en Firestore
        transaction.delete(
          firestore()
            .collection("Organizations")
            .doc(organizationId)
            .collection("storage")
            .doc(drawerId)
            .collection("content")
            .doc(fileId)
        );
      } else {
        // Añadir el tamaño del archivo al total de capacidad consumida por la locación
        transaction.update(locationDocRef, {
          storageUsed: firestore.FieldValue.increment(fileSize),
        });
      }
    });
  } catch (error) {
    const { code, message } = error as FirebaseError;
    throw new functions.https.HttpsError(
      "failed-precondition",
      JSON.stringify({ code, message })
    );
  }
});
