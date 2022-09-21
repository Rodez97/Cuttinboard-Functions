import {
  SendSmtpEmail,
  TransactionalEmailsApi,
  TransactionalEmailsApiApiKeys,
} from "@sendinblue/client";
import MainVariables from "../config";

const apiInstance = new TransactionalEmailsApi();

apiInstance.setApiKey(
  TransactionalEmailsApiApiKeys.apiKey,
  MainVariables.transactionalEmailsApiApiKey
);

export const sendWelcomeEmail = async (
  email: string,
  name: string,
  templateId: number,
  params: {
    [param: string]: string;
  }
) => {
  // Iniciar Sendinblue para el envío del email de notificación cuando es añadido a una locación
  const sendSmtpEmail = new SendSmtpEmail();
  sendSmtpEmail.to = [{ name, email }];
  sendSmtpEmail.templateId = templateId;
  sendSmtpEmail.params = params;

  try {
    await apiInstance.sendTransacEmail(sendSmtpEmail);
  } catch (error) {
    throw error;
  }
};
