import { credential, firestore } from "firebase-admin";
import { initializeApp } from "firebase-admin/app";
import { CREDENTIALS } from "./config";
import { exportFunctions } from "better-firebase-functions";
import { camelCase } from "lodash";

initializeApp({
  credential: credential.cert(CREDENTIALS),
  databaseURL: "https://cuttinboard-2021-default-rtdb.firebaseio.com",
  storageBucket: "cuttinboard-2021.appspot.com",
});
firestore().settings({ ignoreUndefinedProperties: true });

exportFunctions({
  __filename,
  exports,
  functionDirectoryPath: "./api",
  funcNameFromRelPath: (relPath) => {
    if (!relPath) {
      return "";
    }

    // Split by / or \
    const parts = relPath.split(/[/\\]/);
    const name = parts[parts.length - 1].split(".")[0];
    const finalParts = parts.slice(0, parts.length - 1);

    return [...finalParts, camelCase(name)].join("-").toLowerCase();
  },
});
