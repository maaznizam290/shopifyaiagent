import { saveCampaign } from "@/app/actions";
import { CampaignForm } from "@/components/CampaignForm";
import { Flash, type SP } from "@/components/Flash";
import { PageHeader } from "@/components/ui";
import { campaignDefaults, productOptions } from "@/lib/campaigns/formData";
import { getActiveStore } from "@/lib/settings";

export default async function NewCampaignPage({ searchParams }: { searchParams: SP }) {
  const store = await getActiveStore();
  const products = store ? await productOptions(store.id) : [];
  return (
    <>
      <PageHeader eyebrow="Campaign Guardian" title="New campaign" subtitle="Enter the campaign exactly as it will appear to customers. The original submission is stored unchanged for the audit trail." />
      <Flash searchParams={searchParams} />
      <CampaignForm action={saveCampaign} products={products} defaults={await campaignDefaults()} storefrontBase={`https://${store?.publicDomain ?? store?.shopDomain ?? ""}`} />
    </>
  );
}
