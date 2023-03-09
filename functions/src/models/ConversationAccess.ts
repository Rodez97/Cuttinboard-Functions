export type ConversationAccess = {
  members: Record<string, boolean> | null;
  muted: Record<string, boolean> | null;
  hosts: Record<string, boolean> | null;
  position: string | null;
  privacyLevel: number;
};
