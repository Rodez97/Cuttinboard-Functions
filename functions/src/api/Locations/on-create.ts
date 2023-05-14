import { ILocation } from "@cuttinboard-solutions/types-helpers";
import { firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { handleError } from "../../services/handleError";

export default functions.firestore
  .document(`/Locations/{locationId}`)
  .onCreate(async (change) => {
    // Get the location data
    const { organizationId } = change.data() as ILocation;

    try {
      // Increment the locations count in the organization document
      await firestore()
        .collection("Organizations")
        .doc(organizationId)
        .update({ locations: firestore.FieldValue.increment(1) });
    } catch (error) {
      handleError(error);
    }
  });
