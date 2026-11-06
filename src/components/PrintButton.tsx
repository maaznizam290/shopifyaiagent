"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>
      <Printer size={14} /> Print / save PDF
    </button>
  );
}
