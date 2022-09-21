import { firestore } from "firebase-admin";
import * as functions from "firebase-functions";

export default functions.firestore
  .document(`/Users/{uid}/devices/{deviceId}`)
  .onWrite(async (change, context) => {
    // Extraer el id del usuario de los parámetros de la función
    const { uid } = context.params;
    // Obtener las llaves de las locaciones a las cuáles pertenece el usuario
    const locationsEmpRef = await firestore()
      .collectionGroup("employees")
      .where("id", "==", uid)
      .get();

    if (locationsEmpRef.empty) {
      throw new functions.https.HttpsError(
        "unknown",
        "The user doesn't have locations to update"
      );
    }

    const batch = firestore().batch();

    for (const { ref } of locationsEmpRef.docs) {
      const beforeData = change.before.data();
      const afterData = change.after.data();
      if (beforeData?.expoToken === afterData?.expoToken) {
        continue;
      }
      if (beforeData?.expoToken) {
        batch.update(ref, {
          expoToolsTokens: firestore.FieldValue.arrayRemove(
            beforeData.expoToken
          ),
        });
      }
      if (afterData?.expoToken) {
        batch.update(ref, {
          expoToolsTokens: firestore.FieldValue.arrayUnion(afterData.expoToken),
        });
      }
    }

    try {
      // Ejecutar el lote de cambios correspondiente
      await batch.commit();
    } catch (error) {
      throw new functions.https.HttpsError(
        "unknown",
        "There was an error updating the user data",
        error
      );
    }
  });
