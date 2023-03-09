import { firestore, storage } from "firebase-admin";
import * as functions from "firebase-functions";
import { handleError } from "../../services/handleError";

export default functions.storage.object().onFinalize(async (object) => {
  const filePath = object.name;

  // Size of the file
  const fileSize = Number(object.size);

  // Regex to get the information from the file path (organizationId, locationId, drawerId, fileName)
  const regexLocationStoragePath =
    /^organizations\/([\w\-_]+)\/locations\/([\w\-_]+)\/storage\/([\w\-_]+)\/(\w+.[\w\-_]{1,4})/i;

  const regexGlobalStoragePath =
    /^organizations\/([\w\-_]+)\/storage\/([\w\-_]+)\/(\w+.[\w\-_]{1,4})/i;

  if (filePath && regexGlobalStoragePath.test(filePath)) {
    const matches = filePath.match(regexGlobalStoragePath);

    if (!matches) {
      return;
    }

    const [organizationId, drawerId, fileName] = matches.slice(1); // Organization ID, Drawer ID, File name
    await updateGlobalUsage(
      organizationId,
      fileSize,
      drawerId,
      fileName,
      filePath
    );
  }

  if (filePath && regexLocationStoragePath.test(filePath)) {
    const matches = filePath.match(regexLocationStoragePath);

    if (!matches) {
      return;
    }

    const [, locationId, drawerId, fileName] = matches.slice(1); // Organization ID, Drawer ID, File name
    await updateLocationUsage(
      locationId,
      fileSize,
      drawerId,
      fileName,
      filePath
    );
  }
});

async function updateGlobalUsage(
  organizationId: string,
  fileSize: number,
  drawerId: string,
  filename: string,
  filePath: string
) {
  const organizationRef = firestore().doc(`Organizations/${organizationId}`);
  const fileId = filename.split(".")[0];
  let deleteFile = false;

  try {
    // Update the storage usage of the location by adding the size of the uploaded file
    // * If the limit is exceeded then the transaction will fail and the file will be deleted
    await firestore().runTransaction(async (transaction) => {
      // Get the location document
      const organization = await transaction.get(organizationRef);
      const organizationData = organization.data(); // (!) The location document exists

      if (!organization.exists || !organizationData) {
        // ! If the location document does not exist throw an error
        throw "Location document does not exist";
      }

      // Get the storage limit of the location and the storage used
      const { storageUsed, limits } = organizationData;

      // Get the storage used in the location
      const locationStorageUsage = Number(storageUsed);

      // Get the storage limit of the location
      const locationStorageLimit = Number(limits.storage);

      if (locationStorageUsage + fileSize > locationStorageLimit) {
        // ! If the storage limit is exceeded then delete the file and the document
        deleteFile = true;

        // Delete the file document from the drawer
        transaction.delete(
          firestore()
            .collection("Organizations")
            .doc(organizationId)
            .collection("files")
            .doc(drawerId)
            .collection("content")
            .doc(fileId)
        );
      } else {
        // ! If the storage limit is not exceeded then update the storage usage of the location
        transaction.update(organizationRef, {
          storageUsed: firestore.FieldValue.increment(fileSize),
        });
      }
    });

    if (deleteFile) {
      // Delete the file
      await storage().bucket().file(filePath).delete();
    }
  } catch (error) {
    handleError(error);
  }
}

async function updateLocationUsage(
  locationId: string,
  fileSize: number,
  drawerId: string,
  filename: string,
  filePath: string
) {
  const locationRefRef = firestore().doc(`Locations/${locationId}`);
  const fileId = filename.split(".")[0];
  let deleteFile = false;

  try {
    // Update the storage usage of the location by adding the size of the uploaded file
    // * If the limit is exceeded then the transaction will fail and the file will be deleted
    await firestore().runTransaction(async (transaction) => {
      // Get the location document
      const location = await transaction.get(locationRefRef);
      const locationData = location.data(); // (!) The location document exists

      if (!location.exists || !locationData) {
        // ! If the location document does not exist throw an error
        throw "Location document does not exist";
      }

      // Get the storage limit of the location and the storage used
      const { storageUsed, limits } = locationData;

      // Get the storage used in the location
      const locationStorageUsage = Number(storageUsed);

      // Get the storage limit of the location
      const locationStorageLimit = Number(limits.storage);

      if (locationStorageUsage + fileSize > locationStorageLimit) {
        // ! If the storage limit is exceeded then delete the file and the document
        deleteFile = true;

        // Delete the file document from the drawer
        transaction.delete(
          firestore()
            .collection("Locations")
            .doc(locationId)
            .collection("files")
            .doc(drawerId)
            .collection("content")
            .doc(fileId)
        );
      } else {
        // ! If the storage limit is not exceeded then update the storage usage of the location
        transaction.update(locationRefRef, {
          storageUsed: firestore.FieldValue.increment(fileSize),
        });
      }
    });

    if (deleteFile) {
      // Delete the file
      await storage().bucket().file(filePath).delete();
    }
  } catch (error) {
    handleError(error);
  }
}
