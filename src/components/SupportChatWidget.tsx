import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";

type SupportMessage = { id: string; sender: string; sender_id: string | null; body: string; created_at: string };

/**
 * One ongoing support thread per property — any staff member at that
 * hotel sees and can continue the same conversation with Serai's team,
 * rather than each person having their own separate thread.
 */
export function SupportChatWidget({ propertyId, open, onOpenChange }: { propertyId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: conversationId } = useQuery({
    queryKey: ["support-conversation-id", propertyId],
    enabled: open,
    queryFn: async () => {
      const { data: existing } = await supabase
        .from("support_conversations")
        .select("id")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) return existing.id;
      const { data: created, error } = await supabase
        .from("support_conversations")
        .insert({ property_id: propertyId })
        .select("id")
        .single();
      if (error) throw error;
      return created.id;
    },
  });

  // Opening the widget counts as read — clears the icon's notification
  // dot regardless of whether staff actually send a reply.
  useEffect(() => {
    if (!open || !conversationId) return;
    supabase.from("support_conversations").update({ needs_staff: false }).eq("id", conversationId).then(() => {
      qc.invalidateQueries({ queryKey: ["support-needs-staff", propertyId] });
    });
  }, [open, conversationId, propertyId, qc]);

  const { data: messages, refetch } = useQuery({
    queryKey: ["support-messages", conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<SupportMessage[]> => {
      const { data } = await supabase
        .from("support_messages")
        .select("id, sender, sender_id, body, created_at")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase
      .channel(`support-chat-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages", filter: `conversation_id=eq.${conversationId}` },
        () => refetch(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, refetch]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    if (!body.trim() || !conversationId || sending) return;
    setSending(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("support_messages").insert({
      conversation_id: conversationId,
      sender: "staff",
      sender_id: auth.user?.id,
      body: body.trim(),
    });
    setSending(false);
    if (!error) {
      setBody("");
      refetch();
      qc.invalidateQueries({ queryKey: ["support-messages", conversationId] });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md flex flex-col h-[600px] max-h-[80vh] p-0 gap-0">
        <DialogHeader className="p-4 border-b border-border">
          <DialogTitle>Chat with support</DialogTitle>
        </DialogHeader>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {!messages || messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center mt-6">
              Send us a message and we'll get back to you here.
            </p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender === "staff" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.sender === "staff" ? "bg-brand text-brand-foreground" : "bg-muted"}`}>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className={`text-[10px] mt-1 ${m.sender === "staff" ? "text-brand-foreground/70" : "text-muted-foreground"}`}>
                    {m.sender === "staff" ? "You" : "Serai support"} · {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-3 border-t border-border flex gap-2 items-center">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Type your message…"
            className="min-h-[40px] max-h-24 resize-none"
            rows={1}
          />
          <Button size="sm" className="shrink-0" onClick={send} disabled={!body.trim() || sending}>
            Send
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
