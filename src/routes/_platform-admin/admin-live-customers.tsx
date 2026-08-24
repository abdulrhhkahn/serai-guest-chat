import { createFileRoute } from "@tanstack/react-router";
import { CustomersTable } from "@/components/admin/CustomersTable";

export const Route = createFileRoute("/_platform-admin/admin-live-customers")({
  component: () => (
    <CustomersTable
      variant="live"
      title="Live customers"
      description="Every onboarded hotel that isn't offboarded. Click a row to open its full detail."
      emptyMessage="No customers yet — onboard one first."
    />
  ),
});
