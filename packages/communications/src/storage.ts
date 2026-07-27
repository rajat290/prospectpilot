import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/plain"
]);
const blockedExtensions = new Set([
  ".app", ".bat", ".cmd", ".com", ".dll", ".dmg", ".exe", ".hta", ".jar", ".js", ".msi", ".ps1", ".scr", ".sh", ".vbs"
]);

export type StoredAttachment = {
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  scanStatus: "CLEAN" | "QUARANTINED" | "BLOCKED";
  scanDetails?: string;
};

export function sanitizeFileName(value: string) {
  const base = path.basename(value).normalize("NFKC");
  const safe = base.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\s+/g, " ").trim();
  return (safe || "attachment").slice(0, 160);
}

export function validateAttachment(fileName: string, mimeType: string, sizeBytes: number) {
  if (sizeBytes <= 0) throw new Error("Attachment is empty.");
  if (sizeBytes > MAX_ATTACHMENT_BYTES) throw new Error("Attachment exceeds the 10 MB limit.");
  const extension = path.extname(fileName).toLowerCase();
  if (blockedExtensions.has(extension)) throw new Error(`Attachment type ${extension} is blocked.`);
  if (!allowedMimeTypes.has(mimeType.toLowerCase())) throw new Error(`MIME type ${mimeType} is not allowed.`);
}

export async function storeAttachment(input: {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
  storageRoot: string;
}): Promise<StoredAttachment> {
  const originalName = input.fileName;
  const fileName = sanitizeFileName(input.fileName);
  validateAttachment(fileName, input.mimeType, input.bytes.length);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const scan = scanAttachment(input.bytes);
  const storageKey = `${sha256.slice(0, 2)}/${sha256}-${fileName}`;
  const absolutePath = resolveStoragePath(input.storageRoot, storageKey);
  if (scan.status === "CLEAN") {
    await mkdir(path.dirname(absolutePath), { recursive: true });
    try {
      await stat(absolutePath);
    } catch {
      await writeFile(absolutePath, input.bytes, { flag: "wx" });
    }
  }
  return {
    fileName,
    originalName,
    mimeType: input.mimeType.toLowerCase(),
    sizeBytes: input.bytes.length,
    sha256,
    storageKey,
    scanStatus: scan.status,
    scanDetails: scan.details
  };
}

export async function readStoredAttachment(storageRoot: string, storageKey: string) {
  return readFile(resolveStoragePath(storageRoot, storageKey));
}

export function createAttachmentSignature(attachmentId: string, expiresAt: number, signingKey: string) {
  if (!signingKey) throw new Error("Attachment signing key is not configured.");
  return createHmac("sha256", signingKey).update(`${attachmentId}:${expiresAt}`).digest("base64url");
}

export function verifyAttachmentSignature(attachmentId: string, expiresAt: number, signature: string, signingKey: string) {
  if (!signingKey || expiresAt < Math.floor(Date.now() / 1000)) return false;
  const expected = createAttachmentSignature(attachmentId, expiresAt, signingKey);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function resolveStoragePath(storageRoot: string, storageKey: string) {
  const root = path.resolve(storageRoot);
  const target = path.resolve(root, storageKey);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("Invalid attachment storage key.");
  return target;
}

function scanAttachment(bytes: Buffer): { status: "CLEAN" | "QUARANTINED"; details?: string } {
  const sample = bytes.subarray(0, Math.min(bytes.length, 256 * 1024)).toString("latin1");
  if (sample.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")) {
    return { status: "QUARANTINED", details: "Malware scan hook detected the EICAR test signature." };
  }
  return { status: "CLEAN" };
}
