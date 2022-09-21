import { exportFunctions } from "better-firebase-functions";
import { credential, firestore } from "firebase-admin";
import { initializeApp } from "firebase-admin/app";
import { CREDENTIALS } from "./config";

initializeApp({
  credential: credential.cert(CREDENTIALS),
  databaseURL: "https://cuttinboard-2021-default-rtdb.firebaseio.com",
  storageBucket: "cuttinboard-2021.appspot.com",
});
firestore().settings({ ignoreUndefinedProperties: true });

exportFunctions({ __filename, exports, functionDirectoryPath: "./api" });
