import { deletePolicy, resetDemo, savePolicy, saveSettings, togglePolicy } from "@/app/actions";
import { Flash, type SP } from "@/components/Flash";
import { Card, PageHeader, Pill } from "@/components/ui";
import { parseJson, prisma } from "@/lib/db";
import { aiStatus, getActiveStore, getSetting, SETTING_KEYS } from "@/lib/settings";

const POLICY_TYPES: Record<string, string> = {
  DISPATCH: "Dispatch",
  DELIVERY: "Delivery",
  SHIPPING_SERVICE: "Shipping",
  GEOGRAPHY: "Regions",
  RESTRICTION: "Restriction",
  PROMOTION: "Promotion",
};

export default async function SettingsPage({ searchParams }: { searchParams: SP }) {
  const store = await getActiveStore();
  const provider = (await getSetting(SETTING_KEYS.aiProvider)) ?? process.env.AI_PROVIDER ?? "rules";
  const checkUrls = (await getSetting(SETTING_KEYS.checkUrls)) !== "false";
  const policies = await prisma.merchantPolicy.findMany({ where: { storeId: store?.id ?? "" }, orderBy: [{ type: "asc" }, { name: "asc" }] });
  const ai = aiStatus();

  return (
    <>
      <PageHeader title="Settings" />
      <Flash searchParams={searchParams} />
      <div className="space-y-6">
        <div>
          <Card title="Policies" pad={false}>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Type</th><th>Name</th><th>Days</th><th>Regions / tags</th><th>Limit</th><th>Detail</th><th></th></tr></thead>
                <tbody>{policies.map((p) => (
                  <tr key={p.id} className={p.active ? "" : "opacity-60"}>
                    <td><Pill>{POLICY_TYPES[p.type] ?? p.type}</Pill></td>
                    <td className="font-medium">{p.name}</td>
                    <td className="whitespace-nowrap tabular-nums">{p.minDays ?? p.maxDays ? `${p.minDays ?? "?"}–${p.maxDays ?? "?"}` : "—"}</td>
                    <td className="text-xs">{parseJson<string[]>(p.regionsJson, []).join(", ") || "—"}</td>
                    <td className="text-xs">{p.freeShippingThreshold ? `$${p.freeShippingThreshold}` : p.maxDiscountPercent ? `${p.maxDiscountPercent}%` : "—"}</td>
                    <td className="max-w-56 text-xs text-muted">{p.detail}</td>
                    <td className="whitespace-nowrap text-right">
                      <form action={togglePolicy} className="inline"><input type="hidden" name="id" value={p.id} /><button className="btn btn-secondary btn-sm">{p.active ? "Disable" : "Enable"}</button></form>{" "}
                      <form action={deletePolicy} className="inline"><input type="hidden" name="id" value={p.id} /><button className="btn btn-danger btn-sm">Delete</button></form>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <form action={savePolicy} className="grid gap-3 border-t border-line bg-cloud/60 p-5 md:grid-cols-4">
              <div><label className="label" htmlFor="type">Type</label><select id="type" name="type" className="input">{Object.entries(POLICY_TYPES).map(([t, l]) => <option key={t} value={t}>{l}</option>)}</select></div>
              <div className="md:col-span-3"><label className="label" htmlFor="pname">Name</label><input id="pname" name="name" required minLength={2} className="input" /></div>
              <div><label className="label" htmlFor="minDays">Min days</label><input id="minDays" name="minDays" inputMode="numeric" className="input" /></div>
              <div><label className="label" htmlFor="maxDays">Max days</label><input id="maxDays" name="maxDays" inputMode="numeric" className="input" /></div>
              <div><label className="label" htmlFor="fst">Free shipping over</label><input id="fst" name="freeShippingThreshold" inputMode="decimal" className="input" /></div>
              <div><label className="label" htmlFor="mdp">Max discount (%)</label><input id="mdp" name="maxDiscountPercent" inputMode="decimal" className="input" /></div>
              <div className="md:col-span-2"><label className="label" htmlFor="regions">Regions / tags</label><input id="regions" name="regions" className="input" placeholder="AU, NZ" /></div>
              <div className="md:col-span-2"><label className="label" htmlFor="detail">Detail</label><input id="detail" name="detail" className="input" /></div>
              <div className="flex justify-end md:col-span-4"><button className="btn btn-primary">Add policy</button></div>
            </form>
          </Card>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card title="Verification">
            <form action={saveSettings} className="space-y-4">
              <fieldset>
                <legend className="label">Claim analysis</legend>
                <div className="space-y-2 text-sm">
                  <label className="flex items-center gap-2"><input type="radio" name="aiProvider" value="rules" defaultChecked={provider === "rules"} />Rules</label>
                  <label className="flex items-center gap-2"><input type="radio" name="aiProvider" value="ollama" defaultChecked={provider === "ollama"} />Ollama<span className="text-xs text-muted">{ai.ollamaModel}</span></label>
                  <label className="flex items-center gap-2"><input type="radio" name="aiProvider" value="anthropic" defaultChecked={provider === "anthropic"} disabled={!ai.anthropicConfigured} />Anthropic<span className="text-xs text-muted">{ai.anthropicConfigured ? ai.anthropicModel : <code>ANTHROPIC_API_KEY</code>}</span></label>
                </div>
              </fieldset>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="checkUrls" defaultChecked={checkUrls} />Check landing pages</label>
              <div><label className="label" htmlFor="lst">Low-stock threshold</label><input id="lst" name="lowStockThreshold" type="number" min={0} defaultValue={store?.lowStockThreshold ?? 5} className="input" /></div>
              <button className="btn btn-primary w-full">Save</button>
            </form>
          </Card>
          <form action={resetDemo}><button className="btn btn-secondary w-full">Reset demo data</button></form>
        </div>
      </div>
    </>
  );
}
