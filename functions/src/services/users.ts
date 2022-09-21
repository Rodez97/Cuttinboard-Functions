import { firestore } from "firebase-admin";

export async function getUserExpoTokens(userId: string) {
  const userTokens = await firestore()
    .collection("Users")
    .doc(userId)
    .collection("devices")
    .get();
  if (!userTokens || userTokens.empty) {
    return [];
  }
  const tokens: string[] = [];
  for (const doc of userTokens.docs) {
    const { expoToken } = doc.data();
    tokens.push(expoToken);
  }
  return tokens;
}
