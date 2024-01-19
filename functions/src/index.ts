import { credential, firestore } from "firebase-admin";
import { initializeApp } from "firebase-admin/app";
import { exportFunctions } from "better-firebase-functions";
import { camelCase } from "lodash";

initializeApp({
  credential: credential.cert({
    projectId: process.env.SERVICE_ACCOUNT_PROJECT_ID,
    clientEmail: process.env.SERVICE_ACCOUNT_CLIENT_EMAIL,
    privateKey: process.env.SERVICE_ACCOUNT_PRIVATE_KEY,
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
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
