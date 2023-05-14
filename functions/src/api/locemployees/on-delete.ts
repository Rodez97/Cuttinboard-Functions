/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { IEmployeesDocument } from "@cuttinboard-solutions/types-helpers";
import * as functions from "firebase-functions";
import deleteEmployees from "../../services/deletedEmployees";

// Update the conversations when a new employee is created.
export default functions.firestore
  .document("/Locations/{locationId}/employees/employeesDocument")
  .onDelete(async (snapshot, context) => {
    // Destructure the employeeId from the context params
    const { locationId } = context.params;

    const oldDocument = snapshot.data() as IEmployeesDocument;

    const { employees } = oldDocument;
    if (!employees) return;

    const oldEmployees = Object.values(employees);

    await deleteEmployees(locationId, oldEmployees, true);
  });
