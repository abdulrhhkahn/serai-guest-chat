import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useCurrentPropertyId } from "@/lib/use-current-property";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/requests")({
  component: RequestsPage,
});

type RequestRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  conversation_id: string | null;
  checkin_id: string | null;
  created_at: string;
  assigned_to: string | null;
};

const STAGES = [
  { key: "new", label: "New" },
  { key: "assigned", label: "Assigned" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
] as const;

const STAGE_MESSAGE: Record<string, string> = {
  assigned: "we've assigned this to a team member",
  in_progress: "we're working on it now",
  completed: "this has been taken care of",
};

function RequestsPage() {
  const qc = useQueryClient();
  const { data: propertyId } = useCurrentPropertyId();

  const { data: requests } = useQuery({
    queryKey: ["guest-requests", propertyId],
    enabled: !!propertyId,
    queryFn: async (): Promise<RequestRow[]> => {
      const { data } = await supabase
        .from("guest_requests")
        .select("id, title, description, status, conversation_id, checkin_id, created_at, assigned_to")
        .eq("property_id", propertyId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Changing status also posts a plain message back into the guest's own
  // conversation, reusing the same messages table everything else uses —
  // this is genuinely just a message, not a separate notification system.
  async function changeStatus(req: RequestRow, status: string) {
    const { error } = await supabase.from("guest_requests").update({ status, updated_at: new Date().toISOString() }).eq("id", req.id);
    if (error) return toast.error(error.message);

    if (req.conversation_id && STAGE_MESSAGE[status]) {
      await supabase.from("messages").insert({
        conversation_id: req.conversation_id,
        sender: "staff",
        body: `Update on your request "${req.title}" — ${STAGE_MESSAGE[status]}.`,
        source: "manual",
      });
      await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", req.conversation_id);
    }
    qc.invalidateQueries({ queryKey: ["guest-requests", propertyId] });
    toast.success("Request updated");
  }

  const grouped = STAGES.map((stage) => ({
    ...stage,
    items: (requests ?? []).filter((r) => r.status === stage.key),
  }));

  return (
    <div className="p-6 space-y-4 max-w-7xl">
      <div>
        <h1 className="font-serif text-3xl">Requests</h1>
        <p className="text-sm text-muted-foreground">Structured guest requests raised from a conversation.</p>
      </div>

      {!requests?.length ? (
        <Card className="py-10 text-center text-sm text-muted-foreground">
          No requests yet — create one from within a conversation.
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {grouped.map((stage) => (
            <div key={stage.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">{stage.label}</h2>
                <Badge variant="secondary">{stage.items.length}</Badge>
              </div>
              <div className="space-y-2">
                {stage.items.map((req) => (
                  <Card key={req.id} className="p-3 space-y-2">
                    <p className="text-sm font-medium">{req.title}</p>
                    {req.description && <p className="text-xs text-muted-foreground">{req.description}</p>}
                    <p className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                    </p>
                    <Select value={req.status} onValueChange={(v) => changeStatus(req, v)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES.map((s) => (
                          <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Card>
                ))}
                {stage.items.length === 0 && (
                  <p className="text-xs text-muted-foreground py-4 text-center">Nothing here</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
