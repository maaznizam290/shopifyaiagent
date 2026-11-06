import { notFound } from "next/navigation";
import { saveCampaign } from "@/app/actions";
import { CampaignForm } from "@/components/CampaignForm";
import { Flash, type SP } from "@/components/Flash";
import { PageHeader } from "@/components/ui";
import { campaignDefaults, productOptions } from "@/lib/campaigns/formData";
import { prisma } from "@/lib/db";

export default async function EditCampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const c = await prisma.campaign.findUnique({ where: { id }, include: { store: true } });
  if (!c) notFound();
  return (
    <>
      <PageHeader title={c.name} />
      <Flash searchParams={searchParams} />
      <CampaignForm
        action={saveCampaign}
        products={await productOptions(c.storeId)}
        defaults={await campaignDefaults(id)}
        storefrontBase={`https://${c.store.publicDomain ?? c.store.shopDomain}`}
        resubmits={["APPROVED", "LIVE"].includes(c.status)}
      />
    </>
  );
}
