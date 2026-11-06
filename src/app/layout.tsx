import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PromiSure AI",
  description: "Every campaign, verified against live store facts. Shopify Campaign Integrity & Commerce Assurance by NousGen.",
  // icon.svg and src/app/favicon.ico (linked automatically by Next.js) are both generated from
  // src/lib/brand.ts with `npm run icons`, so they match the in-app logo.
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
};

// Fonts load at runtime (with system fallbacks) so builds never depend on network access.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
