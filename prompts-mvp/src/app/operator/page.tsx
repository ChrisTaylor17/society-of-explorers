import type { Metadata } from "next";
import { OperatorDashboard } from "@/components/operator/OperatorDashboard";

export const metadata: Metadata = {
  title: "Operator Evidence | Prompt Atlas",
  description: "Private aggregate product and subscription evidence for Prompt Atlas.",
  robots: { index: false, follow: false, noarchive: true },
};

export default function OperatorPage() {
  return <OperatorDashboard />;
}
