/**
 * Locación
 * @description Una locación es el objeto primario alrededor del cuál se ejectutan todas las operaciones.
 */
type Location = {
  /**
   * Nombre
   */
  name: string;
  /**
   * Descripción
   */
  description?: string;
  /**
   * Dirección de la locación
   */
  address?: string;
  /**
   * Correo electrónico de la locación
   */
  email?: string;
  /**
   * Número de teléfono de la locación
   */
  phoneNumber?: string;
  /**
   * ID interno de la locación en caso de ser necesario por parte del cliente
   */
  intId?: string;
  /**
   * Estado actual de la suscripción vinculada a la locación y por ende la locación en si
   */
  subscriptionStatus:
    | "incomplete"
    | "incomplete_expired"
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "unpaid";
  /**
   * Cantidad de empleados activos en la locación
   */
  employeesCount: number;
  /**
   * Espacio de almacenamiento consumido por la locación en bytes
   */
  storageUsed: number;
  /**
   * Límites de la locación según su plan
   */
  limits: {
    /**
     * Límite maximo de empleados
     */
    employees: number;
    /**
     * Capacidad máxima de almacenamiento
     */
    storage: string;
  };
  organizationId: string;
  subscriptionId: string;
  // Profile picture
  profilePicture?: string;
  members: string[];
  supervisors?: string[];
};

export default Location;
