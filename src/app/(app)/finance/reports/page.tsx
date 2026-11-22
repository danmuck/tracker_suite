import { redirect } from "next/navigation";

// Reports now live in a tab on the Projections page
export default function ReportsPage() {
  redirect("/finance/projections?view=reports");
}
