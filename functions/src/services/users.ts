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
  userTokens.forEach((doc) => {
    const expoToken = doc.get("expoToken");
    if (expoToken) {
      tokens.push(expoToken);
    }
  });
  return tokens;
}
