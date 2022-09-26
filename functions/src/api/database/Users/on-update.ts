import { FirebaseError, firestore } from "firebase-admin";
import * as functions from "firebase-functions";
/**
 * Esta función se encarga de propagar los cambios realizados en la información del usuario
 * a su perfil de empleado en las diferentes locaciones a las que pertenece.
 */
export default functions.firestore
  .document(`/Users/{uid}`)
  .onUpdate(async (change, context) => {
    // Extraer el id del usuario de los parámetros de la función
    const { uid } = context.params;
    // inicializar el lote de actualizaciones.
    const batch = firestore().batch();
    // Obtener los datos del usuario después del cambio
    const {
      customerId,
      subscriptionId,
      paymentMethods,
      organizations,
      avatar,
      ...afterEmployeeData
    } = change.after.data();
    // Actualizar la información del usuario para cada locación a la que pertenece y añadirla al lote de actualizaciones (batch)
    const locationsEmpSnap = await firestore()
      .collectionGroup("employees")
      .where("id", "==", uid)
      .get();
    for (const { ref } of locationsEmpSnap.docs) {
      // Referencia al documento de empleados de la locación
      batch.update(ref, afterEmployeeData);
    }

    if (
      change.before.get("name") !== afterEmployeeData.name ||
      change.before.get("lastName") !== afterEmployeeData.lastName
    ) {
      // Actualizar avatar de los chats en los que es miembro
      const directMessagesSnap = await firestore()
        .collection("DirectMessages")
        .orderBy(`members.${uid}`)
        .get();

      directMessagesSnap.forEach((dmSnap) =>
        batch.set(
          dmSnap.ref,
          {
            members: {
              [uid]: `${afterEmployeeData.name} ${afterEmployeeData.lastName}`,
            },
          },
          { merge: true }
        )
      );
    }

    try {
      // Ejecutar el lote de cambios correspondiente
      await batch.commit();
    } catch (error) {
      const { code, message } = error as FirebaseError;
      throw new functions.https.HttpsError(
        "failed-precondition",
        JSON.stringify({ code, message })
      );
    }
  });
