/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { IEmployeesDocument } from "@cuttinboard-solutions/types-helpers";
import * as functions from "firebase-functions";
import { addEmployeesToPublicConversations } from "../../services/addEmployeesToPublicConversations";

// Update the conversations when a new employee is created.
export default functions.firestore
  .document("/Locations/{locationId}/employees/employeesDocument")
  .onCreate(async (snapshot, context) => {
    // Destructure the employeeId from the context params
    const { locationId } = context.params;

    const newDocument = snapshot.data() as IEmployeesDocument;

    const { employees } = newDocument;
    if (!employees) return;

    const newEmployees = Object.values(employees);

    await addEmployeesToPublicConversations(locationId, newEmployees);
  });
