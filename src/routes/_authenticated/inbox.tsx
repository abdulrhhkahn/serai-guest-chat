import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { deliveryLabel } from "@/lib/delivery";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Sparkles, Send, FileText, Users, History, AlertTriangle, Clock, CheckCircle2, Search } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { logActivity } from "@/lib/activity-log";
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
  resolved_at: string | null;
  checkin_id: string | null;
  channel: string | null;
  csat_rating: number | null;
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
  delivery_status: string | null;
  delivery_error: string | null;
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

type ConvEvent = { id: string; conversation_id: string; event_type: string; detail: string | null; actor_user_id: string | null; created_at: string };

async function logEvent(conversationId: string, event_type: string, detail?: string | null) {
  const { data: u } = await supabase.auth.getUser();
  await supabase.from("conversation_events").insert({
    conversation_id: conversationId,
    event_type,
    detail: detail ?? null,
    actor_user_id: u.user?.id ?? null,
  });
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"any" | "needs_staff" | "resolved" | "open">("any");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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

  // Full-text-ish search across guest question keywords: matching conversation ids.
  const searchTerm = search.trim();
  const { data: searchHits } = useQuery({
    queryKey: ["inbox-search", searchTerm],
    enabled: searchTerm.length > 1,
    queryFn: async () => {
      const { data } = await supabase.from("messages")
        .select("conversation_id, body, sender, created_at")
        .ilike("body", `%${searchTerm}%`)
        .order("created_at", { ascending: false })
        .limit(500);
      const map = new Map<string, string>();
      for (const m of data ?? []) if (!map.has(m.conversation_id)) map.set(m.conversation_id, m.body);
      return map;
    },
  });

  // Audit trail of state changes for the open conversation
  const { data: events } = useQuery({
    queryKey: ["conversation-events", activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const { data } = await supabase.from("conversation_events")
        .select("*").eq("conversation_id", activeId!).order("created_at");
      return (data ?? []) as ConvEvent[];
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
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;
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
      .filter((r) => {
        if (statusFilter === "needs_staff") return r.flagged;
        if (statusFilter === "resolved") return !!r.conv.resolved_at;
        if (statusFilter === "open") return !r.conv.resolved_at;
        return true;
      })
      .filter((r) => {
        if (!fromMs && !toMs) return true;
        const t = r.conv.last_message_at ? new Date(r.conv.last_message_at).getTime() : null;
        if (t === null) return false;
        if (fromMs && t < fromMs) return false;
        if (toMs && t > toMs) return false;
        return true;
      })
      .filter((r) => {
        if (searchTerm.length <= 1) return true;
        if (searchHits?.has(r.conv.id)) return true;
        return (r.conv.guest_name ?? "").toLowerCase().includes(searchTerm.toLowerCase());
      })
      .sort((a, b) => (b.priority - a.priority) || (b.waitedMs - a.waitedMs));
  }, [conversations, waitInfo, queueMode, statusFilter, dateFrom, dateTo, searchTerm, searchHits]);

  const attentionCount = useMemo(
    () => (conversations ?? []).filter((c) => c.needs_staff || waitInfo.get(c.id)?.awaiting).length,
    [conversations, waitInfo],
  );

  const filtersActive = statusFilter !== "any" || !!dateFrom || !!dateTo || searchTerm.length > 1;

  // Mark a conversation handled (or reopen it). The guest's status pill listens for
  // this update over realtime and switches to "Resolved".
  async function setResolved(conversationId: string, done: boolean) {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("conversations").update(
      done
        ? { status: "closed", needs_staff: false, resolved_at: new Date().toISOString(), resolved_by: u.user?.id ?? null }
        : { status: "open", resolved_at: null, resolved_by: null },
    ).eq("id", conversationId);
    if (error) return toast.error(error.message);
    await logEvent(conversationId, done ? "resolved" : "reopened");
    if (done) await logActivity("conversation_resolved");
    // For SMS/WhatsApp conversations, invite a rating by text (web guests get the
    // in-app star prompt instead). dispatch no-ops for web conversations.
    if (done) {
      const conv = conversations?.find((c) => c.id === conversationId);
      if (conv && conv.channel && conv.channel !== "web" && !conv.csat_rating) {
        try {
          const { data: s } = await supabase.auth.getSession();
          await fetch("/api/outbound/dispatch", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
            body: JSON.stringify({ conversationId, body: "Thanks for staying with us! How did we do? Reply 1-5 (5 = great)." }),
          });
        } catch { /* best-effort */ }
      }
    }
    toast.success(done ? "Marked resolved — guest notified" : "Conversation reopened");
    qc.invalidateQueries({ queryKey: ["conversations"] });
    qc.invalidateQueries({ queryKey: ["open-last-guest"] });
    qc.invalidateQueries({ queryKey: ["conversation-events"] });
  }


  async function retryMessage(m: Message) {
    try {
      const { data: s } = await supabase.auth.getSession();
      await supabase.from("messages").update({ delivery_status: "queued", delivery_error: null }).eq("id", m.id);
      await fetch("/api/outbound/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
        body: JSON.stringify({ conversationId: m.conversation_id, body: m.body, messageId: m.id }),
      });
      qc.invalidateQueries({ queryKey: ["messages", m.conversation_id] });
    } catch { /* best-effort */ }
  }

  async function sendTo(conversationId: string, body: string, source: "manual" | "ai_draft_approved" | "ai_draft_edited" | "template", originalDraft?: string | null) {
    const { data: u } = await supabase.auth.getUser();
    const { data: inserted, error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender: "staff",
      body: body.trim(),
      approved: true,
      source,
      sender_user_id: u.user?.id ?? null,
      original_draft: originalDraft ?? null,
    }).select("id").single();
    if (error) throw error;
    await supabase.from("conversations").update({ last_message_at: new Date().toISOString(), needs_staff: false }).eq("id", conversationId);
    // Fan out to SMS/WhatsApp if this conversation isn't web-based. Best-effort:
    // the DB write above already happened; dispatch only sends the outbound leg.
    try {
      const { data: s } = await supabase.auth.getSession();
      await fetch("/api/outbound/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
        body: JSON.stringify({ conversationId, body: body.trim(), messageId: inserted?.id }),
      });
    } catch { /* non-web dispatch is best-effort */ }
    await logEvent(conversationId, `reply_${source}`, body.trim().slice(0, 200));
    await logActivity("message_sent", body.trim().slice(0, 100));
  }

  async function send(body: string, source: "manual" | "ai_draft_approved" | "ai_draft_edited" | "template" = "manual", originalDraft?: string | null) {
    if (!activeId || !body.trim()) return;
    try {
      await sendTo(activeId, body, source, originalDraft);
      setDraft("");
      setSuggestion(null);
      qc.invalidateQueries({ queryKey: ["messages", activeId] });
      qc.invalidateQueries({ queryKey: ["conversation-events", activeId] });
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
    await logEvent(activeId, "ai_batch_approved", `AI draft approved and sent to ${sent} conversation${sent === 1 ? "" : "s"}`);
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

  // Pending AI draft for an escalated (non-auto) conversation. Surfaced into the
  // existing approve/edit/dismiss panel and consumed (deleted) once shown.
  const { data: activeAiDraft } = useQuery({
    queryKey: ["ai-draft", activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_drafts")
        .select("id, draft, category")
        .eq("conversation_id", activeId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (activeAiDraft && !suggestion && !loadingSuggestion) {
      setSuggestion(activeAiDraft.draft);
      supabase.from("ai_drafts").delete().eq("id", activeAiDraft.id).then(() => {
        qc.invalidateQueries({ queryKey: ["ai-draft", activeId] });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAiDraft?.id]);

  // Room/stay context for the active conversation, pulled from the linked check-in.
  const { data: activeCheckin } = useQuery({
    queryKey: ["conversation-checkin", active?.checkin_id],
    enabled: !!active?.checkin_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("checkins")
        .select("room, arrival_date, departure_date, guest_name, num_guests")
        .eq("id", active!.checkin_id!)
        .maybeSingle();
      return data;
    },
  });

  return (
    <div className="h-[calc(100vh-3rem)] grid grid-cols-1 md:grid-cols-[360px_1fr]">
      <aside className="border-r border-border overflow-y-auto overflow-x-hidden bg-card/30">
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

          <div className="mt-3 space-y-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search guest questions…"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="any">Any status</option>
              <option value="needs_staff">Needs attention</option>
              <option value="open">Unresolved</option>
              <option value="resolved">Resolved</option>
            </select>
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 min-w-0 flex-1 text-xs px-1.5"
              />
              <span className="text-xs text-muted-foreground shrink-0">→</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 min-w-0 flex-1 text-xs px-1.5"
              />
            </div>
            {filtersActive && (
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{attentionQueue.length} match{attentionQueue.length === 1 ? "" : "es"}</span>
                <button
                  type="button"
                  className="underline"
                  onClick={() => { setSearch(""); setStatusFilter("any"); setDateFrom(""); setDateTo(""); }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </div>
        {!attentionQueue.length ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            {filtersActive ? "No conversations match these filters." : queueMode === "attention" ? "Nothing waiting on staff right now." : "No conversations yet."}
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
                <div className="font-medium truncate flex items-center gap-2">
                  {active.guest_name || "Guest"}
                  {active.resolved_at && (
                    <span className="text-[10px] uppercase tracking-wide bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-full px-1.5 py-0.5 inline-flex items-center gap-1">
                      <CheckCircle2 className="h-2.5 w-2.5" /> Resolved
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {active.guest_contact ?? "web chat"}
                  {active.resolved_at && ` · marked handled ${formatDistanceToNow(new Date(active.resolved_at), { addSuffix: true })}`}
                </div>
                {activeCheckin && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {activeCheckin.room && (
                      <span className="text-[11px] font-medium bg-primary/10 text-primary rounded-md px-2 py-0.5">
                        Room {activeCheckin.room}
                      </span>
                    )}
                    {activeCheckin.arrival_date && (
                      <span className="text-[11px] bg-muted text-muted-foreground rounded-md px-2 py-0.5">
                        {activeCheckin.departure_date
                          ? `${activeCheckin.arrival_date} → ${activeCheckin.departure_date}`
                          : `Arrives ${activeCheckin.arrival_date}`}
                      </span>
                    )}
                    {activeCheckin.num_guests ? (
                      <span className="text-[11px] bg-muted text-muted-foreground rounded-md px-2 py-0.5">
                        {activeCheckin.num_guests} {activeCheckin.num_guests === 1 ? "guest" : "guests"}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {active.resolved_at ? (
                  <Button variant="outline" size="sm" onClick={() => setResolved(active.id, false)}>
                    Reopen
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setResolved(active.id, true)}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Mark resolved
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setAuditOpen(true)}>
                  <History className="h-3.5 w-3.5 mr-1.5" /> Audit
                </Button>
              </div>
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
                    {(() => {
                      if (m.sender === "guest") return null;
                      const d = deliveryLabel(m.delivery_status, m.delivery_error);
                      if (d.tone === "none") return null;
                      const cls = d.tone === "ok" ? "opacity-70" : d.tone === "error" ? "text-red-200" : "opacity-60";
                      return (
                        <div className={`mt-1 text-[10px] flex items-center gap-2 justify-end ${m.sender === "staff" ? cls : (d.tone === "error" ? "text-red-600" : "opacity-60")}`}>
                          <span>{d.label}</span>
                          {d.failed && (
                            <button className="underline hover:no-underline" onClick={() => retryMessage(m)}>Retry</button>
                          )}
                        </div>
                      );
                    })()}
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
                              const { data: auth } = await supabase.auth.getUser();
                              const { data: prof } = await supabase.from("staff_profiles").select("property_id").eq("id", auth.user?.id ?? "").maybeSingle();
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
              Messages and state changes with source and timestamp.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {(() => {
              const items: { key: string; at: string; node: ReactNode }[] = [
                ...(messages ?? []).map((m) => ({ key: `m-${m.id}`, at: m.created_at, node: <AuditRow m={m} /> })),
                ...(events ?? []).filter((e) => !e.event_type.startsWith("reply_")).map((e) => ({
                  key: `e-${e.id}`,
                  at: e.created_at,
                  node: <EventRow e={e} />,
                })),
              ].sort((a, b) => a.at.localeCompare(b.at));
              if (!items.length) return <p className="text-sm text-muted-foreground">No activity yet.</p>;
              return items.map((i) => <div key={i.key}>{i.node}</div>);
            })()}
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

const EVENT_LABELS: Record<string, { label: string; tone: string }> = {
  resolved: { label: "Marked resolved", tone: "bg-emerald-100 text-emerald-900" },
  reopened: { label: "Reopened", tone: "bg-amber-100 text-amber-900" },
  ai_batch_approved: { label: "AI draft approved for similar threads", tone: "bg-blue-100 text-blue-900" },
};

function EventRow({ e }: { e: ConvEvent }) {
  const meta = EVENT_LABELS[e.event_type] ?? { label: e.event_type.replace(/_/g, " "), tone: "bg-muted text-foreground" };
  return (
    <div className="rounded-lg border border-dashed border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 ${meta.tone}`}>{meta.label}</span>
        <span className="text-[11px] text-muted-foreground">{format(new Date(e.created_at), "MMM d, HH:mm:ss")}</span>
      </div>
      {e.detail && <p className="mt-1.5 text-xs text-muted-foreground whitespace-pre-wrap">{e.detail}</p>}
    </div>
  );
}
