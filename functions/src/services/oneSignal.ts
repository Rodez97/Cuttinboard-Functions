import axios, { AxiosRequestConfig } from "axios";
import { logger } from "firebase-functions";

export interface INotificationObject {
  include_external_user_ids: string[];
  app_id: string;
  contents: {
    en: string;
    es?: string;
  };
  headings: {
    en: string;
    es?: string;
  };
  data?: {
    [key: string]: string | number | boolean;
  };
  ios_attachments?: {
    [key: string]: string;
  };
  big_picture?: string;
  android_channel_id?: string;
  existing_android_channel_id?: string;
  android_group?: string;
  thread_id?: string;
  summary_arg?: string;
  large_icon?: string;
  app_url?: string;
  collapse_id?: string;
  android_group_message?: {
    en: string;
    es?: string;
  };
}

/**
 * Send OneSignal notification by axios request.
 * @param notification Notification to send.
 */
export const sendNotificationToUids = async (
  notification: INotificationObject
) => {
  // Initialize the axios request
  const options: AxiosRequestConfig<string> = {
    method: "POST",
    url: "https://onesignal.com/api/v1/notifications",
    headers: {
      accept: "application/json",
      Authorization: `Basic ${process.env.ONE_SIGNAL_APP_KEY}`,
      "content-type": "application/json",
    },
    data: JSON.stringify(notification),
  };
  try {
    // Send the notification
    const response = await axios.request(options);
    logger.log(response.status);
  } catch (error) {
    logger.error(error);
  }
};
