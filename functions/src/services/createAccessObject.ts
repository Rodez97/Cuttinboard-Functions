/**
 * Creates an access object for a conversation in Realtime Database.
 * @param members The members of the conversation
 * @param muted The muted members of the conversation
 * @returns An object with the access tags and privacy level
 */
export function createAccessObject(
  members: string[] | undefined,
  muted: string[] | undefined
) {
  // Create the access object
  const accessObject: {
    [key: string]: boolean;
  } = {};

  // Add the members to the access object
  members?.forEach((member) => {
    // Check if the member is muted
    const isMuted = muted ? muted.includes(member) : false;

    // Add the member to the access object
    accessObject[member] = isMuted;
  });

  return accessObject;
}
