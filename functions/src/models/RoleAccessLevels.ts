/**
 * Roles jerárquicos dentro de una locación:
 * - **OWNER** -
 * - **ADMIN** -
 * - **GENERAL_MANAGER** -
 * - **MANAGER** -
 * - **STAFF** -
 */
const enum RoleAccessLevels {
  OWNER = 0,
  ADMIN = 1,
  GENERAL_MANAGER = 2,
  MANAGER = 3,
  STAFF = 4,
}

export default RoleAccessLevels;
