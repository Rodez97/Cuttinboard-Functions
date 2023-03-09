import { firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { handleError } from "../../services/handleError";

export default functions.storage.object().onDelete(async (object) => {
  const filePath = object.name;

  // Size of the file
  const fileSize = Number(object.size);

  // Regex to get the information from the file path (organizationId, locationId, drawerId, fileName)
  const regexLocationStoragePath =
    /^organizations\/([\w\-_]+)\/locations\/([\w\-_]+)\/storage\/([\w\-_]+)\/(\w+.[\w\-_]{1,4})/i;

  const regexGlobalStoragePath =
    /^organizations\/([\w\-_]+)\/storage\/([\w\-_]+)\/(\w+.[\w\-_]{1,4})/i;

  try {
    if (filePath && regexLocationStoragePath.test(filePath)) {
      const matches = filePath.match(regexLocationStoragePath);

      if (!matches) {
        return;
      }

      const [locationId] = matches.slice(2);
      const locationRef = firestore().doc(`Locations/${locationId}`);
      // Update the storage usage of the location by subtracting the size of the deleted file
      await locationRef.update({
        storageUsed: firestore.FieldValue.increment(-fileSize),
      });
      return;
    }

    if (filePath && regexGlobalStoragePath.test(filePath)) {
      const matches = filePath.match(regexGlobalStoragePath);

      if (!matches) {
        return;
      }

      const [organizationId] = matches.slice(1); // Organization ID, Drawer ID, File name
      const organizationRef = firestore().doc(
        `Organizations/${organizationId}`
      );
      // Update the storage usage of the location by subtracting the size of the deleted file
      await organizationRef.update({
        storageUsed: firestore.FieldValue.increment(-fileSize),
      });
      return;
    }
  } catch (error) {
    handleError(error);
  }
});
