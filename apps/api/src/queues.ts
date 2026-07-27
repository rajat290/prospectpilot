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
export const communicationQueue = new Queue("communications", { connection });

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

export async function queueCommunicationSend(messageId: string, dueAt?: Date) {
  const trackedJob = await prisma.job.create({
    data: {
      type: "SEND_MESSAGE",
      status: "QUEUED",
      payload: { messageId, dueAt: dueAt?.toISOString() }
    }
  });
  const delay = dueAt ? Math.max(0, dueAt.getTime() - Date.now()) : 0;
  const job = await communicationQueue.add(
    JOB_NAMES.sendCommunication,
    { messageId, trackedJobId: trackedJob.id },
    {
      delay,
      jobId: `send:${messageId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: 100,
      removeOnFail: 250
    }
  );
  return { trackedJob, queueJobId: String(job.id) };
}

export async function queueGmailSync(connectionId: string) {
  const trackedJob = await prisma.job.create({
    data: { type: "SYNC_MAILBOX", status: "QUEUED", payload: { connectionId } }
  });
  await communicationQueue.add(
    JOB_NAMES.syncGmail,
    { connectionId, trackedJobId: trackedJob.id },
    {
      jobId: `gmail-sync:${connectionId}:${Date.now()}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: 100,
      removeOnFail: 250
    }
  );
  return trackedJob;
}
