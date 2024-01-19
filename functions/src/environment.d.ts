declare global {
  namespace NodeJS {
    interface ProcessEnv {
      STRIPE_SECRET_KEY: string;
      STRIPE_WEBHOOK_SECRET: string;
      MESSAGING_SENDER_ID: string;
      API_KEY: string;
      MESSAGING_KEY: string;
      CUTTINBOARD_ACCESS_TOKEN: string;
      TRANSACTIONAL_EMAILS_API_KEY: string;
      ONE_SIGNAL_APP_KEY: string;
      ONE_SIGNAL_USER_AUTH_KEY: string;
      ONE_SIGNAL_APP_ID: string;
      STRIPE_PRODUCT_ID: string;
      STRIPE_PRICE_ID: string;
      SCHEDULE_CHANNEL_ID: string;
      MESSAGE_BOARDS_CHANNEL_ID: string;
      DIRECT_MESSAGES_CHANNEL_ID: string;
      SERVICE_ACCOUNT_PROJECT_ID: string;
      SERVICE_ACCOUNT_CLIENT_EMAIL: string;
      SERVICE_ACCOUNT_PRIVATE_KEY: string;
      DATABASE_URL: string;
      STORAGE_BUCKET: string;
    }
  }
}

export {};
