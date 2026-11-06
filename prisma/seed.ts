import { prisma } from "../src/lib/db";
import { seedDemo } from "../src/lib/demo/seed";
import { detectChangedProducts } from "../src/lib/monitoring/monitor";
import { runVerification } from "../src/lib/verification/service";

async function main() {
  const { storeId, campaignIds } = await seedDemo(prisma);
  await detectChangedProducts(storeId); // monitoring baseline
  for (const id of campaignIds) {
    const r = await runVerification(id, "SUBMISSION", "seed");
    const c = await prisma.campaign.findUnique({ where: { id }, select: { name: true } });
    console.log(`${r.result.riskStatus.padEnd(6)} ${String(r.result.riskScore).padStart(3)}  ${c?.name}`);
  }
  console.log("Demo data seeded (DEMO DATA).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
