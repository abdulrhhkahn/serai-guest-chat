import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_platform-admin/admin-support")({
  component: AdminSupportPage,
});

type ThreadSummary = {
  id: string;
  propertyId: string;
  propertyName: string;
  needsAdmin: boolean;
  lastMessageAt: string;
  lastMessagePreview: string | null;
};

type SupportMessage = { id: string; sender: string; sender_id: string | null; body: string; created_at: string };

function AdminSupportPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: threads, isLoading } = useQuery({
    queryKey: ["support-threads"],
    queryFn: async (): Promise<ThreadSummary[]> => {
      const { data: convos } = await supabase
        .from("support_conversations")
        .select("id, property_id, needs_admin, last_message_at")
        .order("last_message_at", { ascending: false });
      if (!convos?.length) return [];

      const propertyIds = [...new Set(convos.map((c) => c.property_id))];
      const { data: properties } = await supabase
        .from("properties")
        .select("id, name")
        .in("id", propertyIds);
      const propertyById = new Map((properties ?? []).map((p) => [p.id, p]));

      const convoIds = convos.map((c) => c.id);
      const { data: lastMessages } = await supabase
        .from("support_messages")
        .select("conversation_id, body, created_at")
        .in("conversation_id", convoIds)
        .order("created_at", { ascending: false });
      const previewByConvo = new Map<string, string>();
      for (const m of lastMessages ?? []) {
        if (!previewByConvo.has(m.conversation_id)) previewByConvo.set(m.conversation_id, m.body);
      }

      return convos.map((c) => {
        const prop = propertyById.get(c.property_id);
        return {
          id: c.id,
          propertyId: c.property_id,
          propertyName: prop?.name ?? "Unknown property",
          needsAdmin: c.needs_admin,
          lastMessageAt: c.last_message_at,
          lastMessagePreview: previewByConvo.get(c.id) ?? null,
        };
      });
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("admin-support-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["support-threads"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["support-threads"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      <div className="w-80 border-r border-border overflow-y-auto">
        <div className="p-4 border-b border-border">
          <h1 className="font-serif text-xl">Support</h1>
          <p className="text-xs text-muted-foreground">Client queries from every hotel.</p>
        </div>
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : !threads?.length ? (
          <p className="p-4 text-sm text-muted-foreground">No support conversations yet.</p>
        ) : (
          threads.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className={`w-full text-left px-4 py-3 border-b border-border hover:bg-muted/40 ${selectedId === t.id ? "bg-muted/60" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{t.propertyName}</span>
                {t.needsAdmin && <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />}
              </div>
              {t.lastMessagePreview && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{t.lastMessagePreview}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatDistanceToNow(new Date(t.lastMessageAt), { addSuffix: true })}
              </p>
            </button>
          ))
        )}
      </div>
      <div className="flex-1">
        {selectedId ? (
          <ThreadView key={selectedId} conversationId={selectedId} />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Select a conversation to view it.
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadView({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Opening the conversation counts as read, independent of whether the
  // admin actually replies — clears the badge/red-dot the moment it's
  // viewed rather than leaving it on until a reply is sent.
  useEffect(() => {
    supabase.from("support_conversations").update({ needs_admin: false }).eq("id", conversationId).then(() => {
      qc.invalidateQueries({ queryKey: ["support-threads"] });
      qc.invalidateQueries({ queryKey: ["support-needs-admin-count"] });
    });
  }, [conversationId, qc]);

  const { data: messages, refetch } = useQuery({
    queryKey: ["support-messages", conversationId],
    queryFn: async (): Promise<SupportMessage[]> => {
      const { data } = await supabase
        .from("support_messages")
        .select("id, sender, sender_id, body, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`admin-support-thread-${conversationId}`)
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
    if (!body.trim() || sending) return;
    setSending(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("support_messages").insert({
      conversation_id: conversationId,
      sender: "admin",
      sender_id: auth.user?.id,
      body: body.trim(),
    });
    setSending(false);
    if (!error) {
      setBody("");
      refetch();
      qc.invalidateQueries({ queryKey: ["support-threads"] });
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages?.map((m) => (
          <div key={m.id} className={`flex ${m.sender === "admin" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[60%] rounded-lg px-3 py-2 text-sm ${m.sender === "admin" ? "bg-brand text-brand-foreground" : "bg-muted"}`}>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className={`text-[10px] mt-1 ${m.sender === "admin" ? "text-brand-foreground/70" : "text-muted-foreground"}`}>
                {m.sender === "admin" ? "You" : "Hotel staff"} · {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>
        ))}
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
          placeholder="Reply…"
          className="min-h-[40px] max-h-24 resize-none"
          rows={1}
        />
        <Button size="sm" className="shrink-0" onClick={send} disabled={!body.trim() || sending}>
          Send
        </Button>
      </div>
    </div>
  );
}
