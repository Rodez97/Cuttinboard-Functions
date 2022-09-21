import { storage } from "firebase-admin";
import * as functions from "firebase-functions";

export default functions.database
  .ref("/chatMessages/{organizationId}/{chatId}/{messageId}")
  .onDelete(async (snapshot, context) => {
    try {
      if (snapshot.child("uploaded").val() === true) {
        const filePath = snapshot.child("attachment").child("source").val();
        await storage().bucket().file(filePath).delete();
      }
    } catch (error) {
      throw new Error("An error occurred deleting this chat");
    }
  });
