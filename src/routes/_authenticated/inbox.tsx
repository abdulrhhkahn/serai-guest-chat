import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, Send, FileText, Users, History, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

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
  source: string | null;
  sender_user_id: string | null;
  original_draft: string | null;
};

type Template = { id: string; title: string; body: string; category: string | null };

const STOPWORDS = new Set(["the","a","an","is","are","was","were","and","or","but","of","in","on","at","to","for","with","my","your","our","we","you","i","me","us","it","this","that","can","could","would","should","do","does","did","have","has","had","be","been","being","from","if","when","how","what","where","why","who","which","there","their","they","them","hi","hello","hey","please","thanks","thank"]);

function keywords(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

function similarity(a: string, b: string): number {
  const ka = keywords(a); const kb = keywords(b);
  if (ka.size === 0 || kb.size === 0) return 0;
  let overlap = 0;
  for (const w of ka) if (kb.has(w)) overlap++;
  return overlap / Math.min(ka.size, kb.size);
}

function InboxPage() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [threshold, setThreshold] = useState(0.5);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [queueMode, setQueueMode] = useState<"attention" | "all">("attention");
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

  const { data: templates } = useQuery({
    queryKey: ["response-templates"],
    queryFn: async () => {
      const { data } = await supabase.from("response_templates").select("id,title,body,category").order("title");
      return (data ?? []) as Template[];
    },
  });

  const { data: allOpenLastGuest } = useQuery({
    queryKey: ["open-last-guest"],
    queryFn: async () => {
      const { data: convs } = await supabase.from("conversations")
        .select("id, guest_name")
        .eq("status", "open");
      type Row = { conversation_id: string; guest_name: string | null; body: string; last_guest_at: string | null; last_sender: string | null };
      if (!convs?.length) return [] as Row[];
      const ids = convs.map((c) => c.id);
      const { data: msgs } = await supabase.from("messages")
        .select("conversation_id, body, sender, created_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false });
      const lastGuest = new Map<string, { body: string; created_at: string }>();
      const lastAny = new Map<string, string>();
      for (const m of msgs ?? []) {
        if (!lastAny.has(m.conversation_id)) lastAny.set(m.conversation_id, m.sender);
        if (m.sender === "guest" && !lastGuest.has(m.conversation_id)) {
          lastGuest.set(m.conversation_id, { body: m.body, created_at: m.created_at });
        }
      }
      return convs.map((c) => ({
        conversation_id: c.id,
        guest_name: c.guest_name,
        body: lastGuest.get(c.id)?.body ?? "",
        last_guest_at: lastGuest.get(c.id)?.created_at ?? null,
        last_sender: lastAny.get(c.id) ?? null,
      })) as Row[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("staff-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["messages"] });
        qc.invalidateQueries({ queryKey: ["conversations"] });
        qc.invalidateQueries({ queryKey: ["open-last-guest"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
        qc.invalidateQueries({ queryKey: ["open-last-guest"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const lastGuestInActive = useMemo(() => {
    if (!messages) return "";
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].sender === "guest") return messages[i].body;
    return "";
  }, [messages]);

  // All other open conversations scored against the active one, plus the staff-set threshold.
  const scoredOpen = useMemo(() => {
    if (!lastGuestInActive || !allOpenLastGuest) return [];
    return allOpenLastGuest
      .filter((c) => c.conversation_id !== activeId && c.body)
      .map((c) => ({ ...c, score: similarity(lastGuestInActive, c.body) }))
      .sort((a, b) => b.score - a.score);
  }, [lastGuestInActive, allOpenLastGuest, activeId]);

  const similarOpen = useMemo(
    () => scoredOpen.filter((c) => c.score >= threshold),
    [scoredOpen, threshold],
  );

  const approveTargets = useMemo(
    () => similarOpen.filter((c) => !excluded.has(c.conversation_id)),
    [similarOpen, excluded],
  );

  // Needs-attention queue: flagged / awaiting-guest-reply first, longest wait first.
  const waitInfo = useMemo(() => {
    const map = new Map<string, { waitingSince: string | null; awaiting: boolean }>();
    for (const c of allOpenLastGuest ?? []) {
      map.set(c.conversation_id, {
        waitingSince: c.last_guest_at,
        awaiting: c.last_sender === "guest",
      });
    }
    return map;
  }, [allOpenLastGuest]);

  const attentionQueue = useMemo(() => {
    const list = (conversations ?? []).map((c) => {
      const info = waitInfo.get(c.id);
      const flagged = !!c.needs_staff;
      const awaiting = !!info?.awaiting;
      const since = info?.waitingSince ?? c.last_message_at;
      const waitedMs = since ? Date.now() - new Date(since).getTime() : 0;
      return { conv: c, flagged, awaiting, since, waitedMs, priority: flagged ? 2 : awaiting ? 1 : 0 };
    });
    return list
      .filter((r) => (queueMode === "all" ? true : r.priority > 0))
      .sort((a, b) => (b.priority - a.priority) || (b.waitedMs - a.waitedMs));
  }, [conversations, waitInfo, queueMode]);

  const attentionCount = useMemo(
    () => (conversations ?? []).filter((c) => c.needs_staff || waitInfo.get(c.id)?.awaiting).length,
    [conversations, waitInfo],
  );

  async function sendTo(conversationId: string, body: string, source: "manual" | "ai_draft_approved" | "ai_draft_edited" | "template", originalDraft?: string | null) {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender: "staff",
      body: body.trim(),
      approved: true,
      source,
      sender_user_id: u.user?.id ?? null,
      original_draft: originalDraft ?? null,
    });
    if (error) throw error;
    await supabase.from("conversations").update({ last_message_at: new Date().toISOString(), needs_staff: false }).eq("id", conversationId);
  }

  async function send(body: string, source: "manual" | "ai_draft_approved" | "ai_draft_edited" | "template" = "manual", originalDraft?: string | null) {
    if (!activeId || !body.trim()) return;
    try {
      await sendTo(activeId, body, source, originalDraft);
      setDraft("");
      setSuggestion(null);
      qc.invalidateQueries({ queryKey: ["messages", activeId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    }
  }

  async function approveForAll(body: string, originalDraft: string | null) {
    if (!activeId) return;
    const targets = [activeId, ...approveTargets.map((s) => s.conversation_id)];
    let sent = 0;
    for (const cid of targets) {
      try {
        await sendTo(cid, body, "ai_draft_approved", originalDraft);
        sent++;
      } catch { /* skip */ }
    }
    toast.success(`Sent to ${sent} conversation${sent === 1 ? "" : "s"}`);
    setDraft("");
    setSuggestion(null);
    setPreviewOpen(false);
    setExcluded(new Set());
    qc.invalidateQueries();
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
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-xs">
            <button
              type="button"
              onClick={() => setQueueMode("attention")}
              className={`rounded-md px-2 py-1.5 transition ${queueMode === "attention" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
            >
              Needs attention{attentionCount > 0 ? ` (${attentionCount})` : ""}
            </button>
            <button
              type="button"
              onClick={() => setQueueMode("all")}
              className={`rounded-md px-2 py-1.5 transition ${queueMode === "all" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
            >
              All
            </button>
          </div>
        </div>
        {!attentionQueue.length ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            {queueMode === "attention" ? "Nothing waiting on staff right now." : "No conversations yet."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {attentionQueue.map(({ conv: c, flagged, awaiting, since }) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`w-full text-left p-4 hover:bg-accent transition ${activeId === c.id ? "bg-accent" : ""} ${flagged ? "border-l-2 border-l-amber-400" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium truncate">{c.guest_name || "Guest"}</div>
                  <div className="flex items-center gap-1.5">
                    {flagged && (
                      <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-900 border border-amber-200 rounded-full px-1.5 py-0.5 inline-flex items-center gap-1">
                        <AlertTriangle className="h-2.5 w-2.5" /> Needs staff
                      </span>
                    )}
                    <span className={`h-2 w-2 rounded-full ${c.status === "open" ? "bg-emerald-500" : "bg-muted"}`} />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">{c.guest_contact ?? "web chat"}</div>
                {since && (
                  <div className={`text-[11px] mt-1 inline-flex items-center gap-1 ${awaiting || flagged ? "text-amber-700" : "text-muted-foreground"}`}>
                    <Clock className="h-3 w-3" />
                    {awaiting || flagged ? "waiting " : ""}{formatDistanceToNow(new Date(since), { addSuffix: !(awaiting || flagged) })}
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
            <div className="p-4 border-b border-border flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{active.guest_name || "Guest"}</div>
                <div className="text-xs text-muted-foreground truncate">{active.guest_contact ?? "web chat"}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setAuditOpen(true)}>
                <History className="h-3.5 w-3.5 mr-1.5" /> Audit
              </Button>
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

                  <div className="mt-3 rounded-lg border border-blue-200 bg-white/60 p-2.5">
                    <div className="flex items-center justify-between text-[11px] text-blue-900">
                      <span>Similarity threshold</span>
                      <span className="font-mono">{Math.round(threshold * 100)}%</span>
                    </div>
                    <Slider
                      className="mt-2"
                      min={20}
                      max={100}
                      step={5}
                      value={[Math.round(threshold * 100)]}
                      onValueChange={(v) => setThreshold((v[0] ?? 50) / 100)}
                    />
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-blue-900/80">
                      <span>
                        {similarOpen.length} matching conversation{similarOpen.length === 1 ? "" : "s"}
                        {scoredOpen.length > 0 && ` of ${scoredOpen.length} open`}
                      </span>
                      {scoredOpen.length > 0 && (
                        <button type="button" className="underline" onClick={() => setPreviewOpen((v) => !v)}>
                          {previewOpen ? "Hide preview" : "Preview matches"}
                        </button>
                      )}
                    </div>
                    {previewOpen && (
                      <div className="mt-2 max-h-44 overflow-y-auto space-y-1.5">
                        {similarOpen.length === 0 ? (
                          <p className="text-[11px] text-blue-900/70">No conversations match at this threshold.</p>
                        ) : similarOpen.map((c) => {
                          const checked = !excluded.has(c.conversation_id);
                          return (
                            <label key={c.conversation_id} className="flex items-start gap-2 rounded-md bg-white p-2 border border-blue-100 cursor-pointer">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => setExcluded((prev) => {
                                  const next = new Set(prev);
                                  if (v) next.delete(c.conversation_id); else next.add(c.conversation_id);
                                  return next;
                                })}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-medium truncate">{c.guest_name || "Guest"}</span>
                                  <span className="text-[10px] font-mono text-blue-900/70">{Math.round(c.score * 100)}%</span>
                                </span>
                                <span className="block text-[11px] text-muted-foreground line-clamp-2">{c.body}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => send(suggestion, "ai_draft_approved", suggestion)}>Approve &amp; send</Button>
                    {approveTargets.length > 0 && (
                      <Button size="sm" variant="secondary" onClick={() => approveForAll(suggestion, suggestion)}>
                        <Users className="h-3.5 w-3.5 mr-1" /> Approve for all similar ({approveTargets.length + 1})
                      </Button>
                    )}
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" title="Templates">
                        <FileText className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                      <DropdownMenuLabel>Reply templates</DropdownMenuLabel>
                      {!templates?.length ? (
                        <div className="px-2 py-3 text-xs text-muted-foreground">No templates yet.</div>
                      ) : (
                        <>
                          {templates.map((t) => (
                            <DropdownMenuItem key={t.id} onClick={() => setDraft(t.body)}>
                              <div className="flex flex-col items-start gap-0.5">
                                <span className="text-sm font-medium">{t.title}</span>
                                <span className="text-[11px] text-muted-foreground line-clamp-1">{t.body}</span>
                              </div>
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={async () => {
                              const title = window.prompt("Template title?");
                              if (!title || !draft.trim()) return toast.error("Type a reply first, then save.");
                              const { data: prof } = await supabase.from("staff_profiles").select("property_id").maybeSingle();
                              if (!prof?.property_id) return toast.error("No property");
                              const { error } = await supabase.from("response_templates").insert({
                                property_id: prof.property_id, title, body: draft.trim(),
                              });
                              if (error) return toast.error(error.message);
                              toast.success("Template saved");
                              qc.invalidateQueries({ queryKey: ["response-templates"] });
                            }}
                          >
                            Save current draft as template…
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="outline" size="icon" onClick={getSuggestion} disabled={loadingSuggestion} title="AI suggest">
                    <Sparkles className={`h-4 w-4 ${loadingSuggestion ? "animate-pulse" : ""}`} />
                  </Button>
                  <Button
                    size="icon"
                    onClick={() => {
                      // if the current draft was seeded from a suggestion the user tweaked, mark edited
                      const isEditedDraft = suggestion === null && draft.trim().length > 0 && (messages ?? []).some((m) => m.sender === "ai");
                      send(draft, isEditedDraft ? "ai_draft_edited" : "manual", null);
                    }}
                    disabled={!draft.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">⌘/Ctrl + Enter to send.</p>
            </div>
          </>
        )}
      </section>

      <Sheet open={auditOpen} onOpenChange={setAuditOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Conversation audit</SheetTitle>
            <SheetDescription>
              Every message in this conversation with source and timestamp.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {!messages?.length ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : messages.map((m) => (
              <AuditRow key={m.id} m={m} />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function sourceLabel(m: Message): { label: string; tone: string } {
  if (m.sender === "guest") return { label: "Guest", tone: "bg-muted text-foreground" };
  if (m.sender === "ai") return { label: "AI · auto-reply", tone: "bg-blue-100 text-blue-900" };
  // staff
  switch (m.source) {
    case "ai_draft_approved": return { label: "AI-drafted · approved", tone: "bg-emerald-100 text-emerald-900" };
    case "ai_draft_edited": return { label: "AI-drafted · edited", tone: "bg-amber-100 text-amber-900" };
    case "template": return { label: "Template · staff", tone: "bg-violet-100 text-violet-900" };
    case "manual":
    default: return { label: "Manual · staff", tone: "bg-slate-100 text-slate-900" };
  }
}

function AuditRow({ m }: { m: Message }) {
  const { label, tone } = sourceLabel(m);
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 ${tone}`}>{label}</span>
        <span className="text-[11px] text-muted-foreground">{format(new Date(m.created_at), "MMM d, HH:mm:ss")}</span>
      </div>
      <p className="text-sm whitespace-pre-wrap">{m.body}</p>
      {m.source === "ai_draft_edited" && m.original_draft && (
        <details className="mt-2">
          <summary className="text-[11px] text-muted-foreground cursor-pointer">Show original AI draft</summary>
          <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap border-l-2 border-border pl-2">{m.original_draft}</p>
        </details>
      )}
    </div>
  );
}
