import type { Prospect } from "@prisma/client";

const TYPES = [["", "Unknown"], ["AGENCY_MARKETING", "Marketing agency"], ["AGENCY_DEV", "Development agency"], ["DTC_BRAND", "DTC brand"], ["RETAILER", "Retailer"], ["OTHER", "Other"]];

export function ProspectFields({ p, full = false }: { p?: Prospect; full?: boolean }) {
  const f = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={`pf-${name}`}>{label}</label>
      <input id={`pf-${name}`} name={name} className="input" defaultValue={(p?.[name as keyof Prospect] as string | number | null | undefined) ?? ""} {...props} />
    </div>
  );
  return (
    <div className={`grid gap-3 ${full ? "md:grid-cols-2" : ""}`}>
      {p && <input type="hidden" name="id" value={p.id} />}
      {f("companyName", "Company", { required: true })}
      {f("contactName", "Contact")}
      {f("jobTitle", "Job title")}
      {f("location", "Location")}
      {full && f("country", "Country")}
      {f("industry", "Industry")}
      <div>
        <label className="label" htmlFor="pf-businessType">Business type</label>
        <select id="pf-businessType" name="businessType" defaultValue={p?.businessType ?? ""} className="input">{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>
      {f("website", "Website", { type: "url" })}
      {f("linkedinUrl", "LinkedIn", { type: "url" })}
      {full && f("email", "Email", { type: "email" })}
      {full && f("employeeCount", "Employees", { type: "number", min: 1 })}
      <div className={full ? "md:col-span-2" : ""}>
        <label className="label" htmlFor="pf-shopifyEvidence">Shopify evidence</label>
        <input id="pf-shopifyEvidence" name="shopifyEvidence" className="input" defaultValue={p?.shopifyEvidence ?? ""} />
        <label className="mt-1.5 flex items-center gap-2 text-xs"><input type="checkbox" name="shopifyVerified" defaultChecked={p?.shopifyVerified} />Verified</label>
      </div>
      <div className={full ? "md:col-span-2" : ""}>
        <label className="label" htmlFor="pf-problemHypothesis">Hypothesis</label>
        <textarea id="pf-problemHypothesis" name="problemHypothesis" className="input min-h-16" defaultValue={p?.problemHypothesis ?? ""} />
      </div>
      {full && (
        <div className="md:col-span-2">
          <label className="label" htmlFor="pf-notes">Notes</label>
          <textarea id="pf-notes" name="notes" className="input min-h-16" defaultValue={p?.notes ?? ""} />
        </div>
      )}
    </div>
  );
}
