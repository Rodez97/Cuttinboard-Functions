import RoleAccessLevels from "./RoleAccessLevels";

/**
 * Llave de la locación
 */
type LocationKey = {
  locId: string;
  role: RoleAccessLevels;
  pos?: string[];
};

export default LocationKey;
