import { createFileRoute } from "@tanstack/react-router";
import { CustomersTable } from "@/components/admin/CustomersTable";

export const Route = createFileRoute("/_platform-admin/admin-offboarded-customers")({
  component: () => (
    <CustomersTable
      variant="offboarded"
      title="Offboarded customers"
      description="Hotels whose subscription was deactivated. Click a row to reactivate if needed."
      emptyMessage="No offboarded customers."
    />
  ),
});
