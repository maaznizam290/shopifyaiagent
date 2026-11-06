"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, Boxes, History, LayoutDashboard, Megaphone, Menu, MessageSquareText, PlugZap, Settings, Users, X,
} from "lucide-react";
import { Wordmark } from "./Logo";

/** Primary navigation. Groups are separated by space only; every label is one noun. */
export const NAV = [
  [
    { href: "/overview", label: "Overview", icon: LayoutDashboard },
    { href: "/campaigns", label: "Campaigns", icon: Megaphone },
    { href: "/products", label: "Products", icon: Boxes },
    { href: "/history", label: "History", icon: History },
  ],
  [
    { href: "/prospects", label: "Prospects", icon: Users },
    { href: "/outreach", label: "Outreach", icon: MessageSquareText },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
  ],
  [
    { href: "/shopify", label: "Shopify", icon: PlugZap },
    { href: "/settings", label: "Settings", icon: Settings },
  ],
];

export function Sidebar({ storeName, mode }: { storeName: string; mode: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const live = mode === "LIVE";
  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5" aria-label="Main">
      {NAV.map((group, i) => (
        <ul key={i} className="space-y-0.5">
          {group.map(({ href, label, icon: Icon }) => {
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
      ))}
    </nav>
  );
  const footer = (
    <Link href="/shopify" onClick={() => setOpen(false)} className="flex items-center gap-2 border-t border-white/10 px-5 py-4 text-sm text-steel hover:text-white">
      <span className={`h-2 w-2 shrink-0 rounded-full ${live ? "bg-teal" : "bg-brass"}`} aria-hidden />
      <span className="truncate">{storeName}</span>
      <span className={`ml-auto text-[11px] font-semibold ${live ? "text-teal" : "text-brass"}`}>{live ? "Live" : "Demo"}</span>
    </Link>
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
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-ink lg:flex">
        <div className="px-5 py-5">
          <Link href="/overview" aria-label="PromiSure AI home"><Wordmark /></Link>
        </div>
        {nav}
        {footer}
      </aside>
    </>
  );
}
