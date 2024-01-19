/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { IEmployeesDocument } from "@rodez97/types-helpers";
import updatedEmployees from "../../services/updatedEmployees";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import deleteEmployees from "../../services/deletedEmployees";
import { addEmployeesToPublicConversations } from "../../services/addEmployeesToPublicConversations";

// Update the conversations when a new employee is created.
export default onDocumentWritten(
  "/Locations/{locationId}/employees/employeesDocument",
  async (event) => {
    // Destructure the employeeId from the context params
    const { data, params } = event;
    const { locationId } = params;

    const newDocument = data?.after.data() as IEmployeesDocument | undefined;
    const oldDocument = data?.before.data() as IEmployeesDocument | undefined;

    if (!newDocument && oldDocument) {
      // If the new document does not exist and the old document does then delete the employees
      const { employees } = oldDocument;
      if (!employees) return;

      const oldEmployees = Object.values(employees);

      await deleteEmployees(locationId, oldEmployees, true);
    } else if (!oldDocument && newDocument) {
      // If the old document does not exist and the new document does then create the employees
      const { employees } = newDocument;
      if (!employees) return;

      const newEmployees = Object.values(employees);

      await addEmployeesToPublicConversations(locationId, newEmployees);
    } else if (oldDocument && newDocument) {
      // If both documents exist then update the employees
      const { employees: newEmployees } = newDocument;
      const { employees: oldEmployees } = oldDocument;

      const newEmployeesValues = newEmployees
        ? Object.values(newEmployees)
        : [];
      const oldEmployeesValues = oldEmployees
        ? Object.values(oldEmployees)
        : [];

      await updatedEmployees(
        locationId,
        oldEmployeesValues,
        newEmployeesValues
      );
    }
  }
);
