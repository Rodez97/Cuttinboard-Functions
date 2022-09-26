import * as admin from "firebase-admin";

const test = false; //

const MainVariables = {
  stripeSecretKey: test
    ? "rk_test_51KZnSWCYVoOESVglcSUOV89oUz3WqZIspCh4V1xDjEj2WYcdeFwrsOXwTGXcMuDcBGKyUpmCIUqSjP3ajkYRKs5D00swwKlqpZ"
    : "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",
  stripeWebhookSecret: test
    ? "whsec_WoKNSkXt1zhvbp8McX4YIp9rnrPD5KYm"
    : "whsec_EgdRTgh9RH9CvgLsgwhxdiwyvXOkiFe5",
  productsCollectionPath: "Products",
  customersCollectionPath: "Users",
  messagingSenderId: "286988124291",
  apiKey: "AIzaSyAfvaqijLqBAj8dou3yTbbzrUbO-8jT32k",
  messagingKey:
    "AAAAQtHTQIM:APA91bHDZZwXQI-tnJrPVywWdaJ6YbKLfFWG3oQNRVfRaC0CoRBqyhb6P7c7ifwT-qd3mNEHi8qLg6i9pQdAjCJTMewTUu_v-JJM89S90QxW4TwXQbSi9g4vh4-2hOd5Wvki77mmkQeD",
  firebaseCuttinboardAccessToken: "CN4Mbb7McCD0zEOxWk9Z2-hi0_E8kZnO2sDTYhu2",
  transactionalEmailsApiApiKey:
    "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",
  oneSignalAppKey: "N2M1ODdmMzEtNmM5ZS00ODk5LTg2NmMtYzg0MWYyZTIzODZl",
  oseSignalUserAuthKey: "Yzc0NzAwMTQtOWIzMC00YmEzLWExODgtM2M0YWY1MmEyYjk0",
  oneSignalAppId: "867241bc-8690-41a5-a051-000db9b7c136",
};

export const CREDENTIALS = {
  type: "service_account",
  project_id: "cuttinboard-2021",
  private_key_id: "72cc4ff714d60aa6950d69088e085aeb39e531ad",
  private_key:
    "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC8qgEYb2WDIe4S\nRsf3Jz2+j4hFnBpL3VLwsU1eQZ5kFkGU1SUqCcaSeNxJotfUEfSB+AU5lGuAn/WY\nL4QBuFljHper0hY1owEahkP4kmdKqpg7v9gyKGqe5e8S1yn4/G+dSuMFdhrT1Zzb\nyKsb3aj9na0LqE5c4Wm//hMMmERRq3e6bdF3qJGPankaOPnVEa+ucbS6K/jG59SI\n/eaY4T+StzbcF8MCEiFJtYJdwmqcjUb6DbvsQVZIgt27oSe2M3uzQIP/YOvnI5Ou\nqenuEGWbo8wiUPEtrvxXphJLhZBXLbMivT0cmHnn16UZQpvMoFjAQrXCN87MRwjq\nKEvXOMArAgMBAAECggEAVhNoOYpFcb0uvcbuX8xXBtS8kynD853wQ+FYz6q3hamD\n1VAjyxi3sMcUlkIGH3rrp8qNM7aMD5yrc/oly5UcrzTbdSh+Oo16qOveIhBFsRLB\nLu15yXSYJJP6bgmd3Dvr/oMWrbyzQ7e/f6T/sFCC0+c29s0cp5KuaUqVzVbBQNLl\nsPTRjTuHHYB/83He2hzEVKqAFxGW+F6fOc2vYmkF3Z9eudRGudAk5WBOQHCziI6E\nKltawDPiQMOp/eROgnI1dgDxfVGp2QQZR0YQir+Meo/cRxMn3z0Ffh4yHFdHU2Iq\nYwW4l+LN5X6RQCLss6ATCPIdJzvOpVeJw/SfMMELcQKBgQDuiQbiw9akrkclNSTw\nYYeKfrpjFXLsQcfdPVpNIxPljIc9Ef4S1c2wd9UM29mkXFN+vNOUUzXTyNAfgwXy\nzzYoxo8WcvROFzWoIAT58u7toqqrJtQ7AQRov5lw7hv51L1JYSp8rQxcrdqequ0z\na+Sv75jRJvBfuiUS32c1b7AAsQKBgQDKejgxoiBj/W773RVIzdJx/W4ipcQN/0zK\nRRyLjQJvsVJPQD1GR9q24nNY5F2DijqFV9qeIVVtho12jOcLAwpJhIgqK3UEs4a7\nTexZHciXd0b00k9hyn1oO1vCmekb84XDhR4yExyKIRDEMQEj6d9aFv4hiZP33D1B\nRiOtyirlmwKBgQCv5V2thGpYX6dY+Zp2pAS2DQNWo29uZoeCToazUQWQBROI5ias\nLvsRgRwa8lfIisiLMaT3wHB17qQCSLTvOvueD+Vd0YDzwMuxYYMp6YlktMoTkXt4\n0yQ0Ne1pSDxa+xRl8v/IljcCdLU8waBOheZKEm1m9cbVYEeMZi8OSYDI0QKBgA6E\nguD0KfRhaILAkFUfBNbNgAcV8Z+7TWs3V1ueKa2OfkNWbM5MOp9gTzrxbM8Qqy+C\nZBdwdmqa+iuk4LAGcMdirEyxvvsuUBu/85FUNFy/3aOSLMTrOuCtWN/0HyW06UNi\nmQ6oFiTFSCl5BgboLu6LtX78GVLtRKsYd1hvpXG/AoGBAIcYQ7NRti+ZI2VU06KY\n0+AYZFRM6L7SOA7c8Fl/PSVP3ltNyWSxL1dXm2BMB7dILR+in3NkE2dUMgQbWa/R\nsOj6y8mhCsb/4kC8i5JXmVj+IBLOTuYHRZxWtQz4QniddqUaYzOnC/S/soZ6gcLO\nkDhmiNqs959rHpVdzEDBLXgS\n-----END PRIVATE KEY-----\n",
  client_email:
    "firebase-adminsdk-gzxd1@cuttinboard-2021.iam.gserviceaccount.com",
  client_id: "102931220623369699929",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url:
    "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-gzxd1%40cuttinboard-2021.iam.gserviceaccount.com",
} as admin.ServiceAccount;

export default MainVariables;
