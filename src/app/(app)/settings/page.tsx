import { deletePolicy, resetDemo, savePolicy, saveSettings, togglePolicy } from "@/app/actions";
import { Flash, type SP } from "@/components/Flash";
import { Card, Notice, PageHeader, Pill } from "@/components/ui";
import { parseJson, prisma } from "@/lib/db";
import { aiStatus, getActiveStore, getSetting, SETTING_KEYS } from "@/lib/settings";

const TYPE_HELP: Record<string, string> = {
  DISPATCH: "Dispatch estimate (min/max business days)",
  DELIVERY: "Delivery estimate per service (min/max business days)",
  SHIPPING_SERVICE: "Shipping service. Set a free-shipping threshold (0 = free on all orders)",
  GEOGRAPHY: "Regions you ship to (codes: AU, AU_NATIONWIDE, NZ, INTERNATIONAL)",
  RESTRICTION: "Delivery restriction (describe in detail)",
  PROMOTION: "Approved promotion: max discount %, excluded product tags in the regions field",
};

export default async function SettingsPage({ searchParams }: { searchParams: SP }) {
  const store = await getActiveStore();
  const provider = (await getSetting(SETTING_KEYS.aiProvider)) ?? process.env.AI_PROVIDER ?? "rules";
  const checkUrls = (await getSetting(SETTING_KEYS.checkUrls)) !== "false";
  const policies = await prisma.merchantPolicy.findMany({ where: { storeId: store?.id ?? "" }, orderBy: [{ type: "asc" }, { name: "asc" }] });
  const ai = aiStatus();

  return (
    <>
      <PageHeader eyebrow="Settings" title="Settings & merchant policies" subtitle="Configure claim analysis, verification behaviour and the approved policies that delivery and promotion claims are checked against." />
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Merchant policies" subtitle="Delivery and promotion claims are verified only against these. Nothing is inferred from inventory data." pad={false}>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Type</th><th>Name</th><th>Days</th><th>Regions / tags</th><th>Free ship / max %</th><th>Detail</th><th>Status</th><th></th></tr></thead>
                <tbody>{policies.map((p) => (
                  <tr key={p.id} className={p.active ? "" : "opacity-60"}>
                    <td><Pill>{p.type}</Pill></td>
                    <td className="font-medium">{p.name}</td>
                    <td className="whitespace-nowrap tabular-nums">{p.minDays ?? p.maxDays ? `${p.minDays ?? "?"}–${p.maxDays ?? "?"}` : "—"}</td>
                    <td className="text-xs">{parseJson<string[]>(p.regionsJson, []).join(", ") || "—"}</td>
                    <td className="text-xs">{p.freeShippingThreshold ? `$${p.freeShippingThreshold}` : p.maxDiscountPercent ? `${p.maxDiscountPercent}%` : "—"}</td>
                    <td className="max-w-56 text-xs text-muted">{p.detail}</td>
                    <td>{p.active ? <Pill tone="pass">Active</Pill> : <Pill>Inactive</Pill>}</td>
                    <td className="whitespace-nowrap text-right">
                      <form action={togglePolicy} className="inline"><input type="hidden" name="id" value={p.id} /><button className="btn btn-secondary btn-sm">{p.active ? "Disable" : "Enable"}</button></form>{" "}
                      <form action={deletePolicy} className="inline"><input type="hidden" name="id" value={p.id} /><button className="btn btn-danger btn-sm">Delete</button></form>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <form action={savePolicy} className="grid gap-3 border-t border-line bg-cloud/60 p-5 md:grid-cols-4">
              <div><label className="label" htmlFor="type">Type</label><select id="type" name="type" className="input">{Object.keys(TYPE_HELP).map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <div className="md:col-span-3"><label className="label" htmlFor="pname">Name</label><input id="pname" name="name" required minLength={2} className="input" placeholder="Express (metro)" /></div>
              <div><label className="label" htmlFor="minDays">Min days</label><input id="minDays" name="minDays" inputMode="numeric" className="input" /></div>
              <div><label className="label" htmlFor="maxDays">Max days</label><input id="maxDays" name="maxDays" inputMode="numeric" className="input" /></div>
              <div><label className="label" htmlFor="fst">Free shipping over ($)</label><input id="fst" name="freeShippingThreshold" inputMode="decimal" className="input" /></div>
              <div><label className="label" htmlFor="mdp">Max discount (%)</label><input id="mdp" name="maxDiscountPercent" inputMode="decimal" className="input" /></div>
              <div className="md:col-span-2"><label className="label" htmlFor="regions">Regions / excluded tags (comma separated)</label><input id="regions" name="regions" className="input" placeholder="AU, NZ" /></div>
              <div className="md:col-span-2"><label className="label" htmlFor="detail">Detail</label><input id="detail" name="detail" className="input" /></div>
              <div className="md:col-span-4 flex items-center justify-between gap-3"><ul className="text-[11px] text-muted">{Object.entries(TYPE_HELP).map(([k, v]) => <li key={k}><b>{k}</b>: {v}</li>)}</ul><button className="btn btn-primary shrink-0">Add policy</button></div>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Verification & AI">
            <form action={saveSettings} className="space-y-4">
              <fieldset>
                <legend className="label">Claim analysis provider</legend>
                <div className="space-y-2 text-sm">
                  <label className="flex items-start gap-2"><input type="radio" name="aiProvider" value="rules" defaultChecked={provider === "rules"} className="mt-1" /><span><b>Deterministic rules</b><span className="block text-xs text-muted">No AI. Built-in contradiction, age, measurement and evidence rules.</span></span></label>
                  <label className="flex items-start gap-2"><input type="radio" name="aiProvider" value="ollama" defaultChecked={provider === "ollama"} className="mt-1" /><span><b>Ollama (local)</b><span className="block text-xs text-muted">{ai.ollamaModel} at {ai.ollamaUrl}. Falls back to rules if unreachable.</span></span></label>
                  <label className="flex items-start gap-2"><input type="radio" name="aiProvider" value="anthropic" defaultChecked={provider === "anthropic"} disabled={!ai.anthropicConfigured} className="mt-1" /><span><b>Anthropic API</b>{!ai.anthropicConfigured && <Pill>Not configured</Pill>}<span className="block text-xs text-muted">{ai.anthropicModel}. Needs ANTHROPIC_API_KEY (billed separately from Claude Pro).</span></span></label>
                </div>
              </fieldset>
              <p className="text-[11px] text-muted">AI output is schema-validated, must cite approved fact IDs, and can never overrule a deterministic contradiction or pass an unverifiable claim. Prices, stock and dates never use AI.</p>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="checkUrls" defaultChecked={checkUrls} />Check live landing-page URLs (live stores)</label>
              <div><label className="label" htmlFor="lst">Low-stock threshold (units)</label><input id="lst" name="lowStockThreshold" type="number" min={0} defaultValue={store?.lowStockThreshold ?? 5} className="input" /></div>
              <button className="btn btn-primary w-full">Save settings</button>
            </form>
          </Card>
          <Card title="Demo data">
            <p className="mb-3 text-sm text-muted">Restores the fictional demo store, campaigns and prospects to their original state. Live store data is not affected.</p>
            <form action={resetDemo}><button className="btn btn-secondary w-full">Reset demo data</button></form>
          </Card>
          <Notice title="Human-in-the-loop guarantees">PromiSure AI never changes Shopify prices or inventory, publishes posts, launches or funds ads, issues refunds, or sends external messages. Every reviewer decision is recorded in the audit log.</Notice>
        </div>
      </div>
    </>
  );
}
