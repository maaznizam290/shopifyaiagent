"use client";

import { useMemo, useState } from "react";
import { CHANNEL_LABELS } from "./ui";

export interface ProductOption {
  id: string;
  title: string;
  handle: string;
  status: string;
  url: string | null;
  variants: { id: string; title: string; price: string; compareAtPrice: string | null; sku: string | null; qty: number | null; available: boolean }[];
}

export interface CampaignDefaults {
  id?: string;
  name: string;
  channel: string;
  productId: string;
  variantId: string;
  productUrl: string;
  headline: string;
  promoText: string;
  advertisedPrice: string;
  discountType: string;
  discountValue: string;
  startsAt: string;
  endsAt: string;
  claims: string;
  deliveryPromise: string;
}

export function CampaignForm({ action, products, defaults, storefrontBase }: { action: (fd: FormData) => void; products: ProductOption[]; defaults: CampaignDefaults; storefrontBase: string }) {
  const [productId, setProductId] = useState(defaults.productId);
  const [variantId, setVariantId] = useState(defaults.variantId);
  const [url, setUrl] = useState(defaults.productUrl);
  const [discountType, setDiscountType] = useState(defaults.discountType || "NONE");
  const product = useMemo(() => products.find((p) => p.id === productId), [products, productId]);
  const variant = product?.variants.find((v) => v.id === variantId);

  const onProduct = (id: string) => {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    setVariantId(p?.variants[0]?.id ?? "");
    if (p && (!url || products.some((x) => url.endsWith(`/products/${x.handle}`)))) setUrl(p.url ?? `${storefrontBase}/products/${p.handle}`);
  };

  return (
    <form action={action} className="space-y-6">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      <section className="card card-pad">
        <h2 className="mb-4 text-sm font-semibold">Campaign</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="label" htmlFor="name">Campaign name *</label>
            <input id="name" name="name" required minLength={2} defaultValue={defaults.name} className="input" placeholder="Spring sale – Instagram" />
          </div>
          <div>
            <label className="label" htmlFor="channel">Channel *</label>
            <select id="channel" name="channel" defaultValue={defaults.channel || "INSTAGRAM"} className="input">
              {Object.entries(CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="startsAt">Campaign start</label>
            <input id="startsAt" name="startsAt" type="datetime-local" defaultValue={defaults.startsAt} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="endsAt">Campaign expiry</label>
            <input id="endsAt" name="endsAt" type="datetime-local" defaultValue={defaults.endsAt} className="input" />
          </div>
        </div>
      </section>

      <section className="card card-pad">
        <h2 className="mb-4 text-sm font-semibold">Product</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="productId">Product</label>
            <select id="productId" name="productId" value={productId} onChange={(e) => onProduct(e.target.value)} className="input">
              <option value="">Select a product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.title}{p.status !== "ACTIVE" ? ` (${p.status})` : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="variantId">Promoted variant</label>
            <select id="variantId" name="variantId" value={variantId} onChange={(e) => setVariantId(e.target.value)} className="input" disabled={!product}>
              {!product && <option value="">Select a product first</option>}
              {product?.variants.map((v) => <option key={v.id} value={v.id}>{v.title}{v.sku ? ` · ${v.sku}` : ""} · ${v.price}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="productUrl">Product URL (landing page)</label>
            <input id="productUrl" name="productUrl" value={url} onChange={(e) => setUrl(e.target.value)} className="input" placeholder={`${storefrontBase}/products/…`} inputMode="url" />
          </div>
        </div>
        {variant && (
          <p className="mt-3 rounded-lg bg-cloud px-3 py-2 text-xs text-muted">
            Live Shopify data for this variant: price <b className="text-ink">${variant.price}</b>
            {variant.compareAtPrice && <> · compare-at <b className="text-ink">${variant.compareAtPrice}</b></>} · stock <b className="text-ink">{variant.qty ?? "not tracked"}</b> · {variant.available ? "available for sale" : <b className="text-block">unavailable</b>}. Verification compares against this when you submit.
          </p>
        )}
      </section>

      <section className="card card-pad">
        <h2 className="mb-4 text-sm font-semibold">Creative and offer</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <label className="label" htmlFor="headline">Advertised headline</label>
            <input id="headline" name="headline" defaultValue={defaults.headline} className="input" maxLength={300} />
          </div>
          <div className="md:col-span-3">
            <label className="label" htmlFor="promoText">Promotional text</label>
            <textarea id="promoText" name="promoText" defaultValue={defaults.promoText} className="input min-h-24" maxLength={5000} />
          </div>
          <div>
            <label className="label" htmlFor="advertisedPrice">Advertised price (AUD)</label>
            <input id="advertisedPrice" name="advertisedPrice" defaultValue={defaults.advertisedPrice} className="input" inputMode="decimal" placeholder="49.95" />
          </div>
          <div>
            <label className="label" htmlFor="discountType">Discount</label>
            <select id="discountType" name="discountType" value={discountType} onChange={(e) => setDiscountType(e.target.value)} className="input">
              <option value="NONE">No discount</option>
              <option value="PERCENT">Percentage off</option>
              <option value="FIXED_AMOUNT">Fixed amount off</option>
              <option value="COMPARE_AT">Was / now pricing</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="discountValue">{discountType === "PERCENT" ? "Percent off" : discountType === "FIXED_AMOUNT" ? "Amount off (AUD)" : "Discount value"}</label>
            <input id="discountValue" name="discountValue" defaultValue={defaults.discountValue} className="input" inputMode="decimal" disabled={discountType === "NONE" || discountType === "COMPARE_AT"} />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="claims">Product claims (one per line)</label>
            <textarea id="claims" name="claims" defaultValue={defaults.claims} className="input min-h-24" placeholder={"Water-resistant shell\nSuitable for ages 8+"} />
            <p className="mt-1 text-xs text-muted">Claim-like statements in the headline and text are also extracted and checked automatically.</p>
          </div>
          <div>
            <label className="label" htmlFor="deliveryPromise">Delivery promise</label>
            <textarea id="deliveryPromise" name="deliveryPromise" defaultValue={defaults.deliveryPromise} className="input min-h-24" placeholder="Delivery in 3-7 business days" />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button name="intent" value="draft" className="btn btn-secondary">Save draft</button>
        <button name="intent" value="verify" className="btn btn-secondary">Save draft &amp; verify</button>
        <button name="intent" value="submit" className="btn btn-primary">Submit for verification</button>
      </div>
    </form>
  );
}
