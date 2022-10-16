import { firestore } from "firebase-admin";
import RoleAccessLevels from "./RoleAccessLevels";

type EmployeeLocation = {
  locId: string;
  role: RoleAccessLevels;
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
  pos?: string[];
};

export default EmployeeLocation;
