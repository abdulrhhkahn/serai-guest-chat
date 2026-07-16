import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Send } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/inbox")({
  component: InboxPage,
});

type Conversation = {
  id: string;
  guest_name: string | null;
  guest_contact: string | null;
  status: string;
  last_message_at: string | null;
  property_id: string;
  needs_staff: boolean | null;
};

type Message = {
  id: string;
  conversation_id: string;
  sender: string;
  body: string;
  created_at: string;
};

function InboxPage() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: conversations } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const { data } = await supabase.from("conversations").select("*").order("last_message_at", { ascending: false, nullsFirst: false });
      return (data ?? []) as Conversation[];
    },
  });

  useEffect(() => {
    if (!activeId && conversations?.length) setActiveId(conversations[0].id);
  }, [conversations, activeId]);

  const { data: messages } = useQuery({
    queryKey: ["messages", activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const { data } = await supabase.from("messages").select("*").eq("conversation_id", activeId!).order("created_at");
      return (data ?? []) as Message[];
    },
  });

  // realtime
  useEffect(() => {
    const ch = supabase
      .channel("staff-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["messages"] });
        qc.invalidateQueries({ queryKey: ["conversations"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(body: string) {
    if (!activeId || !body.trim()) return;
    const { error } = await supabase.from("messages").insert({
      conversation_id: activeId,
      sender: "staff",
      body: body.trim(),
      approved: true,
    });
    if (error) return toast.error(error.message);
    await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", activeId);
    setDraft("");
    setSuggestion(null);
    qc.invalidateQueries({ queryKey: ["messages", activeId] });
  }

  async function getSuggestion() {
    if (!activeId) return;
    setLoadingSuggestion(true);
    setSuggestion(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch("/api/ai/suggest-reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ conversationId: activeId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setSuggestion(json.reply);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suggestion failed");
    } finally {
      setLoadingSuggestion(false);
    }
  }

  const active = conversations?.find((c) => c.id === activeId);

  return (
    <div className="h-[calc(100vh-3rem)] grid grid-cols-1 md:grid-cols-[320px_1fr]">
      <aside className="border-r border-border overflow-y-auto bg-card/30">
        <div className="p-4 border-b border-border">
          <h2 className="font-serif text-xl">Inbox</h2>
          <p className="text-xs text-muted-foreground">{conversations?.length ?? 0} conversations</p>
        </div>
        {!conversations?.length ? (
          <div className="p-6 text-sm text-muted-foreground text-center">No conversations yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`w-full text-left p-4 hover:bg-accent transition ${activeId === c.id ? "bg-accent" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium truncate">{c.guest_name || "Guest"}</div>
                  <span className={`h-2 w-2 rounded-full ${c.status === "open" ? "bg-emerald-500" : "bg-muted"}`} />
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">{c.guest_contact ?? "web chat"}</div>
                {c.last_message_at && (
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true })}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="flex flex-col min-w-0">
        {!active ? (
          <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-border">
              <div className="font-medium">{active.guest_name || "Guest"}</div>
              <div className="text-xs text-muted-foreground">{active.guest_contact ?? "web chat"}</div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-background">
              {messages?.map((m) => (
                <div key={m.id} className={`flex ${m.sender === "staff" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                    m.sender === "staff"
                      ? "bg-primary text-primary-foreground"
                      : m.sender === "ai"
                        ? "bg-blue-50 text-blue-900 border border-blue-200"
                        : "bg-card border border-border"
                  }`}>
                    {m.sender === "ai" && <div className="text-[10px] uppercase tracking-wide mb-1 opacity-70">AI · guest concierge</div>}
                    <div className="whitespace-pre-wrap">{m.body}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border p-4 space-y-3 bg-card/30">
              {suggestion && (
                <Card className="p-3 bg-blue-50 border-blue-200">
                  <div className="flex items-center gap-2 text-xs font-medium text-blue-900 mb-1">
                    <Sparkles className="h-3 w-3" /> AI-suggested reply
                  </div>
                  <p className="text-sm text-blue-950 whitespace-pre-wrap">{suggestion}</p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => send(suggestion)}>Approve & send</Button>
                    <Button size="sm" variant="outline" onClick={() => { setDraft(suggestion); setSuggestion(null); }}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => setSuggestion(null)}>Dismiss</Button>
                  </div>
                </Card>
              )}
              <div className="flex gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a reply…"
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(draft);
                  }}
                />
                <div className="flex flex-col gap-2">
                  <Button variant="outline" size="icon" onClick={getSuggestion} disabled={loadingSuggestion} title="AI suggest">
                    <Sparkles className={`h-4 w-4 ${loadingSuggestion ? "animate-pulse" : ""}`} />
                  </Button>
                  <Button size="icon" onClick={() => send(draft)} disabled={!draft.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">⌘/Ctrl + Enter to send.</p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
