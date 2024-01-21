import "dotenv/config";
import { firestore, storage } from "firebase-admin";
import { cert, initializeApp } from "firebase-admin/app";
import { exportFunctions } from "better-firebase-functions";
import { camelCase } from "lodash";
import { setGlobalOptions } from "firebase-functions/v2/options";

initializeApp({
  credential: cert({
    projectId: process.env.SERVICE_ACCOUNT_PROJECT_ID,
    clientEmail: process.env.SERVICE_ACCOUNT_CLIENT_EMAIL,
    privateKey: process.env.SERVICE_ACCOUNT_PRIVATE_KEY,
  }),
  databaseURL: process.env.DATABASE_URL,
  storageBucket: "cuttinboard-2021.appspot.com",
});
firestore().settings({ ignoreUndefinedProperties: true });

storage().bucket("cuttinboard-2021.appspot.com");

setGlobalOptions({
  maxInstances: 10,
});

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
