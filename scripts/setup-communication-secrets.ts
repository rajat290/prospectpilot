import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

void main();

async function main() {
  const envPath = path.resolve(process.cwd(), ".env");
  const source = await readFile(envPath, "utf8");
  const lines = source.split(/\r?\n/);
  const generated: string[] = [];

  setIfMissing("COMMUNICATION_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  setIfMissing("ATTACHMENT_SIGNING_KEY", randomBytes(32).toString("base64url"));
  setIfMissing("GMAIL_REDIRECT_URI", "http://localhost:4000/communications/oauth/gmail/callback");

  await writeFile(envPath, `${lines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
  console.log(generated.length ? `Configured: ${generated.join(", ")}` : "Communication secrets were already configured.");

  function setIfMissing(key: string, value: string) {
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    if (index >= 0) {
      const current = lines[index]!.slice(key.length + 1).trim().replace(/^"|"$/g, "");
      if (current) return;
      lines[index] = `${key}="${value}"`;
    } else {
      lines.push(`${key}="${value}"`);
    }
    generated.push(key);
  }
}
