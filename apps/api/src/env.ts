import { config } from "dotenv";

config({ path: new URL("../../../.env", import.meta.url) });

export const env = {
  port: Number(process.env.API_PORT ?? 4000),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  searchProvider: process.env.SEARCH_PROVIDER ?? "serpapi",
  searchProviderApiKey: process.env.SEARCH_PROVIDER_API_KEY ?? "",
  webUrl: process.env.WEB_URL ?? "http://localhost:3000",
  communicationEncryptionKey: process.env.COMMUNICATION_ENCRYPTION_KEY ?? "",
  gmailClientId: process.env.GMAIL_CLIENT_ID ?? "",
  gmailClientSecret: process.env.GMAIL_CLIENT_SECRET ?? "",
  gmailRedirectUri: process.env.GMAIL_REDIRECT_URI ?? "http://localhost:4000/communications/oauth/gmail/callback",
  gmailPubsubTopic: process.env.GMAIL_PUBSUB_TOPIC ?? "",
  gmailWebhookToken: process.env.GMAIL_WEBHOOK_TOKEN ?? ""
};
