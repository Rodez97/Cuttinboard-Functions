/**
 * Nivel de Privacidad de la app:
 * - PUBLIC - *Abierta para todos los miembros de la locación*
 * - PRIVATE - *Solo disponible para los miembros (**members**) seleccionados*
 * - POSITIONS - *Solo disponible para los miembros de la locación que posean al menos una de las posiciones indicadas*
 */
const enum PrivacyLevel {
  PUBLIC = "PUBLIC",
  PRIVATE = "PRIVATE",
  POSITIONS = "POSITIONS",
}

export default PrivacyLevel;
