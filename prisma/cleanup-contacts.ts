import { PrismaClient } from "@prisma/client";
import { isPlausiblePhone } from "@prospectpilot/enrichment";

const prisma = new PrismaClient();

async function main() {
  const phones = await prisma.contact.findMany({
    where: { type: "PHONE" },
    select: { id: true, value: true }
  });
  const invalidIds = phones.filter((phone) => !isPlausiblePhone(phone.value)).map((phone) => phone.id);
  if (invalidIds.length) {
    await prisma.contact.deleteMany({ where: { id: { in: invalidIds } } });
  }
  console.log(`Removed ${invalidIds.length} implausible phone contacts; ${phones.length - invalidIds.length} retained.`);
}

main().finally(() => prisma.$disconnect());
