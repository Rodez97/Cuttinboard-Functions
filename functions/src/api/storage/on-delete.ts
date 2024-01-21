import { firestore } from "firebase-admin";
import { logger } from "firebase-functions/v1";
import { onObjectDeleted } from "firebase-functions/v2/storage";

export default onObjectDeleted(
  { bucket: "cuttinboard-2021.appspot.com" },
  async (event) => {
    const filePath = event.data.name;

    // Size of the file
    const fileSize = Number(event.data.size);

    // Regex to get the information from the file path (organizationId, locationId, drawerId, fileName)
    const regexLocationStoragePath =
      /^locations\/([\w\-_]+)\/files\/([\w\-_]+)\/(\w+.[\w\-_]{1,4})/i;

    const regexGlobalStoragePath =
      /^organizations\/([\w\-_]+)\/files\/([\w\-_]+)\/(\w+.[\w\-_]{1,4})/i;

    try {
      if (filePath && regexLocationStoragePath.test(filePath)) {
        const matches = filePath.match(regexLocationStoragePath);

        if (!matches) {
          return;
        }

        const [locationId] = matches.slice(1);
        const locationRef = firestore().doc(`Locations/${locationId}`);
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

        const [organizationId] = matches.slice(1);
        const organizationRef = firestore().doc(
          `Organizations/${organizationId}`
        );
        await organizationRef.update({
          storageUsed: firestore.FieldValue.increment(-fileSize),
        });
        return;
      }
    } catch (error: any) {
      logger.error(error);
    }
  }
);
