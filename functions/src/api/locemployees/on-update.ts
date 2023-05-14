/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { IEmployeesDocument } from "@cuttinboard-solutions/types-helpers";
import * as functions from "firebase-functions";
import updatedEmployees from "../../services/updatedEmployees";

// Update the conversations when a new employee is created.
export default functions.firestore
  .document("/Locations/{locationId}/employees/employeesDocument")
  .onUpdate(async (snapshot, context) => {
    // Destructure the employeeId from the context params
    const { locationId } = context.params;

    const newDocument = snapshot.after.data();
    const oldDocument = snapshot.before.data();

    const { employees: newEmployees } = newDocument as IEmployeesDocument;
    const { employees: oldEmployees } = oldDocument as IEmployeesDocument;
    if (!newEmployees || !oldEmployees) return;

    const newEmployeesValues = Object.values(newEmployees);
    const oldEmployeesValues = Object.values(oldEmployees);

    await updatedEmployees(locationId, oldEmployeesValues, newEmployeesValues);
  });
