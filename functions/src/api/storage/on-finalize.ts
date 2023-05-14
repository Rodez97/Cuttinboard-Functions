import { firestore, storage } from "firebase-admin";
import * as functions from "firebase-functions";
import { locationConverter } from "../../models/converters/locationConverter";
import { organizationConverter } from "../../models/converters/organizationConverter";

export default functions.storage.object().onFinalize(async (object) => {
  const filePath = object.name;

  // Size of the file
  const fileSize = Number(object.size);

  // Regex to get the information from the file path (organizationId, locationId, drawerId, fileName)
  const regexLocationStoragePath =
    /^locations\/([\w\-_]+)\/files\/([\w\-_]+)\/(\w+.[\w\-_]{1,4})/i;

  const regexGlobalStoragePath =
    /^organizations\/([\w\-_]+)\/files\/([\w\-_]+)\/(\w+.[\w\-_]{1,4})/i;

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

    const [locationId, drawerId, fileName] = matches.slice(1); // Organization ID, Drawer ID, File name
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
  const organizationRef = firestore()
    .doc(`Organizations/${organizationId}`)
    .withConverter(organizationConverter);
  const fileId = filename.split(".")[0];
  let deleteFile = false;

  try {
    // Update the storage usage of the location by adding the size of the uploaded file
    // * If the limit is exceeded then the transaction will fail and the file will be deleted
    await firestore().runTransaction(async (transaction) => {
      // Get the location document
      const organization = await transaction.get(organizationRef);
      const organizationData = organization.data(); // (!) The location document exists

      if (!organizationData) {
        // ! If the location document does not exist throw an error
        throw "Location document does not exist";
      }

      // Get the storage limit of the location and the storage used
      const { storageUsed, limits } = organizationData;

      // Get the storage limit of the location
      const locationStorageLimit = Number(limits.storage);

      if (storageUsed + fileSize > locationStorageLimit) {
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
  } catch (error: any) {
    functions.logger.error(error);
  }
}

async function updateLocationUsage(
  locationId: string,
  fileSize: number,
  drawerId: string,
  filename: string,
  filePath: string
) {
  const locationRefRef = firestore()
    .doc(`Locations/${locationId}`)
    .withConverter(locationConverter);
  const fileId = filename.split(".")[0];
  let deleteFile = false;

  try {
    // Update the storage usage of the location by adding the size of the uploaded file
    // * If the limit is exceeded then the transaction will fail and the file will be deleted
    await firestore().runTransaction(async (transaction) => {
      // Get the location document
      const location = await transaction.get(locationRefRef);
      const locationData = location.data(); // (!) The location document exists

      if (!locationData) {
        // ! If the location document does not exist throw an error
        throw "Location document does not exist";
      }

      // Get the storage limit of the location and the storage used
      const { storageUsed, limits } = locationData;

      // Get the storage limit of the location
      const locationStorageLimit = Number(limits.storage);

      if (storageUsed + fileSize > locationStorageLimit) {
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
  } catch (error: any) {
    functions.logger.error(error);
  }
}
