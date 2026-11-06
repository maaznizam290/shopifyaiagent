import { redirect } from "next/navigation";

// Sales charts now live in Analytics.
export default function SalesPage() {
  redirect("/analytics");
}
