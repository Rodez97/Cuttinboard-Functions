import axios, { AxiosRequestConfig } from "axios";
import MainVariables from "../config";
import { logger } from "firebase-functions";

export const sendNotificationToUids = async (notification: {
  [key: string]: any;
}) => {
  const options: AxiosRequestConfig<string> = {
    method: "POST",
    url: "https://onesignal.com/api/v1/notifications",
    headers: {
      accept: "application/json",
      Authorization: `Basic ${MainVariables.oneSignalAppKey}`,
      "content-type": "application/json",
    },
    data: JSON.stringify(notification),
  };
  try {
    const response = await axios.request(options);
    logger.log(response.status);
  } catch (error) {
    logger.error(error);
    throw error;
  }
};
