import { IOrganizationEmployee } from "@cuttinboard-solutions/types-helpers";
import { firestore, storage } from "firebase-admin";
import * as functions from "firebase-functions";
import { clearUserClaims } from "../../services/auth";

export default functions.firestore
  .document("/Organizations/{organizationId}/employees/{employeeId}")
  .onDelete(async (snapshot, context) => {
    const { organizationId, employeeId } = context.params;
    const { supervisingLocations } = snapshot.data() as IOrganizationEmployee;

    try {
      if (supervisingLocations && supervisingLocations.length > 0) {
        await updateLocationsAndEmployees(employeeId, supervisingLocations);
      }
      await deleteSupervisorDocuments(organizationId, employeeId);
      await clearUserClaims([employeeId], organizationId);
    } catch (error: any) {
      functions.logger.error(error);
      throw new functions.https.HttpsError("unknown", error.message);
    }
  });

async function updateLocationsAndEmployees(
  employeeId: string,
  supervisingLocations: string[]
) {
  const bulkWriter = firestore().bulkWriter();

  supervisingLocations.forEach((locationId) => {
    // Remove the employee from the location members and supervisors arrays
    bulkWriter.update(firestore().collection("Locations").doc(locationId), {
      members: firestore.FieldValue.arrayRemove(employeeId),
      supervisors: firestore.FieldValue.arrayRemove(employeeId),
    });
    // Remove the employee from the location employeesDocument
    bulkWriter.update(
      firestore()
        .collection("Locations")
        .doc(locationId)
        .collection("employees")
        .doc("employeesDocument"),
      `employees.${employeeId}`,
      firestore.FieldValue.delete()
    );
  });

  await bulkWriter.close();
}

const deleteSupervisorDocuments = async (
  organizationId: string,
  employeeId: string
) => {
  try {
    const bucket = storage().bucket();
    await bucket.deleteFiles({
      prefix: `organizations/${organizationId}/employees/${employeeId}`,
    });
  } catch (error) {
    functions.logger.error(error);
  }
};
