import { firestore, storage } from "firebase-admin";
import { clearUserClaims } from "./auth";

export const deleteOrganization = async (organizationId: string) => {
  const batch = firestore().batch();

  const locations = await firestore()
    .collection("Locations")
    .where("organizationId", "==", organizationId)
    .get();

  batch.set(
    firestore().collection("Users").doc(organizationId),
    { subscriptionId: firestore.FieldValue.delete() },
    { merge: true }
  );
  batch.delete(
    firestore()
      .collection("Users")
      .doc(organizationId)
      .collection("subscription")
      .doc("subscriptionDetails")
  );
  batch.delete(
    firestore()
      .collection("Users")
      .doc(organizationId)
      .collection("organizationKeys")
      .doc(organizationId)
  );

  try {
    await batch.commit();
    await firestore().recursiveDelete(
      firestore().collection("Organizations").doc(organizationId)
    );

    for await (const loc of locations.docs) {
      const { members } = loc.data();
      await clearUserClaims(members ?? [], organizationId);
      await firestore().recursiveDelete(loc.ref);
    }

    await storage()
      .bucket()
      .deleteFiles({
        prefix: `organizations/${organizationId}`,
      });
  } catch (error) {
    throw new Error("No se pudo ejecutar la actualización");
  }
};
