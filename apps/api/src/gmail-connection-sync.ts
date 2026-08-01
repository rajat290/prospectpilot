export function oauthSyncCursor(existingConnection: unknown, profileHistoryId: string) {
  return existingConnection ? undefined : profileHistoryId;
}
