import CuttinboardUser from "./CuttinboardUser";
import EmployeeLocation from "./EmployeeLocation";
import FirestoreConverter from "./FirestoreConverter";
import { PrimaryFirestore } from "./PrimaryFirestore";
import RoleAccessLevels from "./RoleAccessLevels";

/**
 * Empleado
 */

type Employee = PrimaryFirestore &
  CuttinboardUser & {
    preferredName?: string;
    emergencyContact?: { name?: string; phoneNumber: string };
    contactComments?: string;
    /******************** Role, Positions & Hourly Wages **********************/
    /**
     * Tokens de expo para el envío de notificaciones
     */
    expoToolsTokens?: string[];
    /**
     * Es dueño de la locación?
     */
    organizationId: string;
    assignedLocations?: string[];
  } & (
    | {
        /**
         * Rol del empeado en la locación
         */
        role: RoleAccessLevels.ADMIN | RoleAccessLevels.OWNER;
        locations?: { [locationId: string]: boolean };
      }
    | {
        role: "employee";
        locations: { [locationId: string]: EmployeeLocation };
      }
  );

export default Employee;

export const EmployeeConverter = FirestoreConverter<Employee>();
