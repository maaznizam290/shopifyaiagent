"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, Boxes, FileCheck2, History, LayoutDashboard, Menu, MessageSquareText, PlugZap, Settings, ShieldCheck, Target, Users, X,
} from "lucide-react";
import { Wordmark } from "./Logo";

const NAV = [
  { section: "Commerce Assurance", items: [
    { href: "/overview", label: "Overview", icon: LayoutDashboard },
    { href: "/shopify", label: "Shopify Connection", icon: PlugZap },
    { href: "/products", label: "Product Intelligence", icon: Boxes },
    { href: "/campaigns", label: "Campaign Guardian", icon: ShieldCheck },
    { href: "/history", label: "Campaign History", icon: History },
    { href: "/reports", label: "Verification Reports", icon: FileCheck2 },
  ] },
  { section: "Growth", items: [
    { href: "/sales", label: "Sales Intelligence", icon: Target },
    { href: "/prospects", label: "Prospect CRM", icon: Users },
    { href: "/outreach", label: "Outreach Copilot", icon: MessageSquareText },
  ] },
  { section: "Workspace", items: [
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/settings", label: "Settings", icon: Settings },
  ] },
];

export function Sidebar({ storeName, mode }: { storeName: string; mode: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Main">
      {NAV.map((group) => (
        <div key={group.section}>
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-steel/70">{group.section}</div>
          <ul className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-white/[0.08] font-medium text-white" : "text-steel hover:bg-white/[0.04] hover:text-white"}`}
                  >
                    <Icon size={17} className={active ? "text-teal" : ""} aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
  const footer = (
    <div className="border-t border-white/10 px-5 py-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-steel/70">Active store</div>
      <div className="mt-1 truncate text-sm text-white">{storeName}</div>
      <div className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${mode === "LIVE" ? "bg-teal/15 text-teal" : "bg-brass/15 text-brass"}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${mode === "LIVE" ? "bg-teal" : "bg-brass"}`} />
        {mode === "LIVE" ? "LIVE SHOPIFY" : "DEMO MODE"}
      </div>
    </div>
  );
  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 lg:hidden">
        <Wordmark />
        <button className="rounded-md p-2 text-steel hover:text-white" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="flex w-72 flex-col bg-ink">{nav}{footer}</div>
          <button className="flex-1 bg-ink/40" aria-label="Close menu" onClick={() => setOpen(false)} />
        </div>
      )}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-ink lg:flex">
        <div className="border-b border-white/10 px-5 py-5">
          <Link href="/overview" aria-label="PromiSure AI home"><Wordmark /></Link>
        </div>
        {nav}
        {footer}
      </aside>
    </>
  );
}

