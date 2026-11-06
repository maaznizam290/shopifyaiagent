"use client";

import { ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { COUNTRIES, CITIES_BY_COUNTRY } from "@/lib/countries";
import { buildLinkedInSearchUrls } from "@/lib/sales/outreach";
import { CopyButton } from "./CopyButton";

function Chips({ options, selected, onToggle, label }: { options: string[]; selected: string[]; onToggle: (v: string) => void; label: string }) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button type="button" key={o} aria-pressed={on} onClick={() => onToggle(o)} className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors ${on ? "bg-ink text-white ring-ink" : "bg-white text-muted ring-line hover:text-ink"}`}>{o}</button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function QueryBuilder({ roles, industries }: { roles: string[]; industries: string[] }) {
  const [r, setR] = useState<string[]>(["Founder", "Head of E-commerce", "E-commerce Manager"]);
  const [i, setI] = useState<string[]>(["Fashion", "Beauty"]);
  const [country, setCountry] = useState<string>("Australia");
  const [l, setL] = useState<string[]>(["Sydney", "Melbourne"]);
  const [shopify, setShopify] = useState(true);
  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>) => (v: string) => set((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
  const cities = CITIES_BY_COUNTRY[country] ?? [];
  const results = useMemo(() => buildLinkedInSearchUrls({ roles: r, industries: i, locations: l, country, includeShopify: shopify }), [r, i, l, country, shopify]);

  return (
    <div className="space-y-4">
      <Chips label="Job titles" options={roles} selected={r} onToggle={toggle(setR)} />
      <Chips label="Industries" options={industries} selected={i} onToggle={toggle(setI)} />
      <fieldset>
        <legend className="label">Locations</legend>
        <label htmlFor="qb-country" className="mb-1 block text-xs text-muted">Country</label>
        <select
          id="qb-country"
          value={country}
          onChange={(e) => {
            setCountry(e.target.value);
            setL([]); // city shortcuts belong to the previous country
          }}
          className="input w-full sm:w-72"
        >
          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {cities.length > 0 ? (
          <div className="mt-2">
            <Chips label={`Cities in ${country} (optional)`} options={cities} selected={l} onToggle={toggle(setL)} />
          </div>
        ) : null}
        <p className="mt-1.5 text-[11px] text-muted">{l.length ? `Searching ${l.length} selected ${l.length === 1 ? "city" : "cities"}.` : `Searching all of ${country}.`}</p>
      </fieldset>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shopify} onChange={(e) => setShopify(e.target.checked)} />Include &quot;Shopify&quot; keyword</label>
      <div className="space-y-2">
        {results.map((q) => (
          <div key={q.location} className="flex flex-col gap-2 rounded-lg border border-line bg-cloud/60 p-3 sm:flex-row sm:items-center sm:justify-between">
            <code className="min-w-0 break-words text-xs">{q.query}</code>
            <div className="flex shrink-0 gap-2"><CopyButton text={q.query} /><a href={q.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm"><ExternalLink size={13} />Open search</a></div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted">Opens LinkedIn search in your own browser session. PromiSure AI does not scrape results or automate LinkedIn. Add relevant people to the CRM manually.</p>
    </div>
  );
}
