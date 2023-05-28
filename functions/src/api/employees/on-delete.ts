import { IOrganizationEmployee } from "@cuttinboard-solutions/types-helpers";
import { firestore, storage } from "firebase-admin";
import * as functions from "firebase-functions";
import { clearUserClaims } from "../../services/auth";
import { cuttinboardUserConverter } from "../../models/converters/cuttinboardUserConverter";

export default functions.firestore
  .document("/Organizations/{organizationId}/employees/{employeeId}")
  .onDelete(async (snapshot, context) => {
    const { organizationId, employeeId } = context.params;
    const { supervisingLocations } = snapshot.data() as IOrganizationEmployee;

    try {
      await updateLocationsAndEmployees(
        employeeId,
        organizationId,
        supervisingLocations
      );
      await deleteSupervisorDocuments(organizationId, employeeId);
      await clearUserClaims([employeeId], organizationId);
    } catch (error: any) {
      functions.logger.error(error);
      throw new functions.https.HttpsError("unknown", error.message);
    }
  });

async function updateLocationsAndEmployees(
  employeeId: string,
  organizationId: string,
  supervisingLocations?: string[]
) {
  const bulkWriter = firestore().bulkWriter();

  // Remove the organization from the user's organization list.
  bulkWriter.update(
    firestore()
      .collection("Users")
      .doc(employeeId)
      .withConverter(cuttinboardUserConverter),
    {
      organizations: firestore.FieldValue.arrayRemove(organizationId),
      [`organizationsRelationship.${organizationId}`]:
        firestore.FieldValue.delete(),
    }
  );

  if (supervisingLocations && supervisingLocations.length > 0) {
    for (const locationId of supervisingLocations) {
      removeEmployeeFromLocation(bulkWriter, locationId, employeeId);
      deleteEmployeeFromEmployeesDocument(bulkWriter, locationId, employeeId);
    }
  }

  await bulkWriter.close();
}

function removeEmployeeFromLocation(
  bulkWriter: firestore.BulkWriter,
  locationId: string,
  employeeId: string
) {
  bulkWriter.update(firestore().collection("Locations").doc(locationId), {
    members: firestore.FieldValue.arrayRemove(employeeId),
    supervisors: firestore.FieldValue.arrayRemove(employeeId),
  });
}

function deleteEmployeeFromEmployeesDocument(
  bulkWriter: firestore.BulkWriter,
  locationId: string,
  employeeId: string
) {
  bulkWriter.update(
    firestore()
      .collection("Locations")
      .doc(locationId)
      .collection("employees")
      .doc("employeesDocument"),
    {
      [`employees.${employeeId}`]: firestore.FieldValue.delete(),
    }
  );
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
