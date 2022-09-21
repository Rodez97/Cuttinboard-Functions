import { firestore } from "firebase-admin";
import LocationKey from "./LocationKey";

type EmployeeLocation = LocationKey & {
  wagePerPosition?: Record<string, number>;
  employeeDataComments?: string;
  mainPosition?: string;
  /**
   * Fecha de incorporación del empleado
   */
  startDate: firestore.FieldValue;
  /******************** Employee Documents **********************/
  employeeDocuments?: Record<string, string>;
  /**
   * Siendo dueño, también cuenta como empleado?
   */
  ownerIsMember?: boolean;
};

export default EmployeeLocation;
