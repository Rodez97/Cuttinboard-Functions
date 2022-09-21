import LocationKey from "./LocationKey";
import RoleAccessLevels from "./RoleAccessLevels";

/**
 * LLave de la Organización
 */
type OrganizationKey = {
  /**
   * ID de la Organización
   */
  orgId: string;

  locKeys?: Record<string, LocationKey>;

  role?: RoleAccessLevels.ADMIN | RoleAccessLevels.OWNER | "employee";
};

export default OrganizationKey;
