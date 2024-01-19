import {
  SendSmtpEmail,
  TransactionalEmailsApi,
  TransactionalEmailsApiApiKeys,
} from "@sendinblue/client";

// This will be used to send emails
const apiInstance = new TransactionalEmailsApi();

// This is the API key used to send emails
apiInstance.setApiKey(
  TransactionalEmailsApiApiKeys.apiKey,
  process.env.TRANSACTIONAL_EMAILS_API_KEY
);

/**
 * Send a welcome email to a user when he is added to an organization.
 * @param email Email of the user to send the email to.
 * @param name Name of the user to send the email to.
 * @param templateId ID of the template to use to send the email.
 * @param params Parameters to use in the template.
 */
export const sendWelcomeEmail = async (
  email: string,
  name: string,
  templateId: number,
  params: {
    [param: string]: string;
  }
) => {
  // Initialize the Sendinblue email
  const sendSmtpEmail = new SendSmtpEmail();
  sendSmtpEmail.to = [{ name, email }];
  sendSmtpEmail.templateId = templateId;
  sendSmtpEmail.params = params;

  try {
    // Send the email
    await apiInstance.sendTransacEmail(sendSmtpEmail);
  } catch (error) {
    console.error(error);

    // If the email couldn't be sent, throw an error
    throw new Error("Email couldn't be sent");
  }
};
