import { firestore } from "firebase-admin";

type CuttinboardUser = {
  /******************** Contact Information **********************/
  /**
   * URL de la imagen de perfil del empleado
   */
  avatar?: string;
  /**
   * Nombre
   */
  name: string;
  /**
   * Apellido
   */
  lastName: string;
  /**
   * Correo electrónico
   */
  email: string;
  /**
   * Número de teléfono
   */
  phoneNumber?: string;
  /**
   * Documentos del usuario
   */
  userDocuments?: Record<string, string>;
  birthDate?: firestore.FieldValue;
  customerId?: string;
  subscriptionId?: string;
};

export default CuttinboardUser;
