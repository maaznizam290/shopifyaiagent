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

/** `resubmits`: the campaign is approved or live, so saving sends it back for review. */
export function CampaignForm({ action, products, defaults, storefrontBase, resubmits = false }: { action: (fd: FormData) => void; products: ProductOption[]; defaults: CampaignDefaults; storefrontBase: string; resubmits?: boolean }) {
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
            <label className="label" htmlFor="name">Name</label>
            <input id="name" name="name" required minLength={2} defaultValue={defaults.name} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="channel">Channel</label>
            <select id="channel" name="channel" defaultValue={defaults.channel || "INSTAGRAM"} className="input">
              {Object.entries(CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="startsAt">Starts</label>
            <input id="startsAt" name="startsAt" type="datetime-local" defaultValue={defaults.startsAt} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="endsAt">Ends</label>
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
              <option value="">—</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.title}{p.status !== "ACTIVE" ? ` (${p.status})` : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="variantId">Variant</label>
            <select id="variantId" name="variantId" value={variantId} onChange={(e) => setVariantId(e.target.value)} className="input" disabled={!product}>
              {!product && <option value="">—</option>}
              {product?.variants.map((v) => <option key={v.id} value={v.id}>{v.title}{v.sku ? ` · ${v.sku}` : ""} · ${v.price}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="productUrl">URL</label>
            <input id="productUrl" name="productUrl" value={url} onChange={(e) => setUrl(e.target.value)} className="input" placeholder={`${storefrontBase}/products/…`} inputMode="url" />
          </div>
        </div>
        {variant && (
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm" aria-label="Live variant">
            <div className="flex gap-1.5"><dt className="text-muted">Price</dt><dd className="font-medium tabular-nums">${variant.price}</dd></div>
            {variant.compareAtPrice && <div className="flex gap-1.5"><dt className="text-muted">Was</dt><dd className="tabular-nums">${variant.compareAtPrice}</dd></div>}
            <div className="flex gap-1.5"><dt className="text-muted">Stock</dt><dd className="tabular-nums">{variant.qty ?? "Untracked"}</dd></div>
            {!variant.available && <dd className="font-medium text-block">Unavailable</dd>}
          </dl>
        )}
      </section>

      <section className="card card-pad">
        <h2 className="mb-4 text-sm font-semibold">Offer</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <label className="label" htmlFor="headline">Headline</label>
            <input id="headline" name="headline" defaultValue={defaults.headline} className="input" maxLength={300} />
          </div>
          <div className="md:col-span-3">
            <label className="label" htmlFor="promoText">Text</label>
            <textarea id="promoText" name="promoText" defaultValue={defaults.promoText} className="input min-h-24" maxLength={5000} />
          </div>
          <div>
            <label className="label" htmlFor="advertisedPrice">Price</label>
            <input id="advertisedPrice" name="advertisedPrice" defaultValue={defaults.advertisedPrice} className="input" inputMode="decimal" />
          </div>
          <div>
            <label className="label" htmlFor="discountType">Discount</label>
            <select id="discountType" name="discountType" value={discountType} onChange={(e) => setDiscountType(e.target.value)} className="input">
              <option value="NONE">None</option>
              <option value="PERCENT">Percentage off</option>
              <option value="FIXED_AMOUNT">Fixed amount off</option>
              <option value="COMPARE_AT">Was / now</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="discountValue">{discountType === "PERCENT" ? "Percent off" : discountType === "FIXED_AMOUNT" ? "Amount off" : "Value"}</label>
            <input id="discountValue" name="discountValue" defaultValue={defaults.discountValue} className="input" inputMode="decimal" disabled={discountType === "NONE" || discountType === "COMPARE_AT"} />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="claims">Claims</label>
            <textarea id="claims" name="claims" defaultValue={defaults.claims} className="input min-h-24" placeholder="One per line" />
          </div>
          <div>
            <label className="label" htmlFor="deliveryPromise">Delivery</label>
            <textarea id="deliveryPromise" name="deliveryPromise" defaultValue={defaults.deliveryPromise} className="input min-h-24" />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button name="intent" value="draft" className="btn btn-secondary">Save draft</button>
        <button name="intent" value="verify" className="btn btn-secondary">Save &amp; verify</button>
        <button name="intent" value="submit" className="btn btn-primary">{resubmits ? "Resubmit" : "Submit"}</button>
      </div>
    </form>
  );
}
