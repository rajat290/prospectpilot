import { config } from "dotenv";

config({ path: new URL("../../../.env", import.meta.url) });

export const env = {
  port: Number(process.env.API_PORT ?? 4000),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  searchProvider: process.env.SEARCH_PROVIDER ?? "serpapi",
  searchProviderApiKey: process.env.SEARCH_PROVIDER_API_KEY ?? ""
};
