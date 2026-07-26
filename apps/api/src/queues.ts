import { Queue } from "bullmq";
import IORedis from "ioredis";
import { JobType, PrismaClient } from "@prisma/client";
import { JOB_NAMES } from "@prospectpilot/shared";
import { env } from "./env.js";

const prisma = new PrismaClient();

export const connection = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null
});

export const enrichmentQueue = new Queue("enrichment", { connection });

export async function queueInitialSourcePipeline(leadSourceId: string, url: string) {
  const trackedJob = await prisma.job.create({
    data: {
      leadSourceId,
      type: "CRAWL_SOURCE",
      status: "QUEUED",
      payload: { leadSourceId, url }
    }
  });

  await enrichmentQueue.add(
    JOB_NAMES.crawlSource,
    { leadSourceId, url, trackedJobId: trackedJob.id },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 250
    }
  );

  return trackedJob;
}

export async function queueCompanyEnrichment(companyId: string, type: JobType = "EXTRACT_CONTACTS") {
  const trackedJob = await prisma.job.create({
    data: {
      type,
      status: "QUEUED",
      payload: { companyId }
    }
  });

  await enrichmentQueue.add(
    JOB_NAMES.enrichCompany,
    { companyId, trackedJobId: trackedJob.id },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 250
    }
  );

  return trackedJob;
}
