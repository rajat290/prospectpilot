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

export async function queueCommunicationSend(messageId: string, dueAt?: Date, attemptId?: string) {
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
      jobId: attemptId ? `send-${messageId}-${attemptId}` : `send-${messageId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: 100,
      removeOnFail: 250
    }
  );
  return { trackedJob, queueJobId: String(job.id) };
}

export async function cancelCommunicationSend(queueJobId?: string | null) {
  if (!queueJobId) return false;
  const job = await communicationQueue.getJob(queueJobId);
  if (!job) return false;
  const state = await job.getState();
  if (state === "active") throw new Error("Message is already being processed and cannot be cancelled.");
  await job.remove();
  return true;
}

export async function queueSequenceProcessing(enrollmentId: string, dueAt = new Date()) {
  const trackedJob = await prisma.job.create({
    data: {
      type: "PROCESS_SEQUENCE",
      status: "QUEUED",
      payload: { enrollmentId, dueAt: dueAt.toISOString() }
    }
  });
  const job = await communicationQueue.add(
    JOB_NAMES.processSequence,
    { enrollmentId, trackedJobId: trackedJob.id },
    {
      delay: Math.max(0, dueAt.getTime() - Date.now()),
      jobId: `sequence-${enrollmentId}-${dueAt.getTime()}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: 200,
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
      jobId: `gmail-sync-${connectionId}-${Date.now()}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: 100,
      removeOnFail: 250
    }
  );
  return trackedJob;
}

export async function queueReplyAnalysis(messageId: string) {
  const trackedJob = await prisma.job.create({
    data: { type: "ANALYZE_REPLY", status: "QUEUED", payload: { messageId } }
  });
  const job = await communicationQueue.add(
    JOB_NAMES.analyzeReply,
    { messageId, trackedJobId: trackedJob.id },
    {
      jobId: `analyze-reply-${messageId}-${Date.now()}`,
      attempts: 2,
      backoff: { type: "exponential", delay: 15_000 },
      removeOnComplete: 200,
      removeOnFail: 250
    }
  );
  return { trackedJob, queueJobId: String(job.id) };
}

export async function queueStalledConversationDetection() {
  const trackedJob = await prisma.job.create({
    data: { type: "DETECT_STALLED_CONVERSATIONS", status: "QUEUED", payload: { requestedAt: new Date().toISOString() } }
  });
  const job = await communicationQueue.add(
    JOB_NAMES.detectStalledConversations,
    { trackedJobId: trackedJob.id },
    { jobId: `detect-stalled-${Date.now()}`, removeOnComplete: 100, removeOnFail: 100 }
  );
  return { trackedJob, queueJobId: String(job.id) };
}
