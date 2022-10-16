import PrivacyLevel from "../models/PrivacyLevel";

export function createAccessObject(
  accessTags: string[],
  privacyLevel: PrivacyLevel
) {
  if (privacyLevel === PrivacyLevel.PUBLIC) {
    return { isPublic: true };
  }

  if (privacyLevel === PrivacyLevel.PRIVATE) {
    return accessTags.reduce((acc, at) => {
      return { acc, [at]: at };
    }, {});
  }

  if (privacyLevel === PrivacyLevel.POSITIONS) {
    const hosts = accessTags
      .filter((at) => at.startsWith("hostId_"))
      .reduce((acc, at) => {
        return { acc, [at]: at.replace("hostId_", "") };
      }, {});
    const position = accessTags.filter((at) => !at.startsWith("hostId_"))[0];
    return { ...hosts, position };
  }

  return {};
}
