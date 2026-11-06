import { redirect } from "next/navigation";

// Every verification run (each with its report) is listed in History.
export default function ReportsPage() {
  redirect("/history");
}
