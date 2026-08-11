import { createFileRoute, notFound } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Send, Wifi, Clock, MapPin, Bell, BellOff } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { notificationSupport, requestNotifyPermission, notifyGuest, loadNotifyPrefs, saveNotifyPrefs, type NotifyPrefs, type NotifyPermission } from "@/lib/guest-notifications";


type StayProperty = { id: string; name: string; slug: string; logo_url: string | null; brand_color: string | null; address: string | null; wifi_ssid: string | null; wifi_password: string | null; checkin_time: string | null; checkout_time: string | null; welcome_message: string | null };

export const Route = createFileRoute("/stay/$slug")({
  loader: async ({ params }) => {
    try {
      const { data } = await supabase.from("properties")
        .select("id,name,slug,logo_url,brand_color,address,wifi_ssid,wifi_password,checkin_time,checkout_time,welcome_message")
        .eq("slug", params.slug).maybeSingle();
      if (!data) {
        // Try cached copy if offline / not found
        if (typeof localStorage !== "undefined") {
          const cached = localStorage.getItem(`serai-stay-${params.slug}`);
          if (cached) return { property: JSON.parse(cached) as StayProperty, offline: true };
        }
        throw notFound();
      }
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(`serai-stay-${params.slug}`, JSON.stringify(data));
      }
      return { property: data as StayProperty, offline: false };
    } catch (e) {
      if (typeof localStorage !== "undefined") {
        const cached = localStorage.getItem(`serai-stay-${params.slug}`);
        if (cached) return { property: JSON.parse(cached) as StayProperty, offline: true };
      }
      throw e;
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.property.name} — Guest hub` : "Guest hub" },
      { name: "theme-color", content: loaderData?.property.brand_color ?? "#0b6b75" },
    ],
  }),
  component: StayHub,
});

type Msg = { id: string; sender: string; body: string; created_at: string };

function StayHub() {
  const { property, offline } = Route.useLoaderData() as { property: StayProperty; offline: boolean };
  const brand = property.brand_color ?? "#0b6b75";

  return (
    <div className="guest-surface min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-lg px-5 py-6">
        <div className="flex items-center gap-3 mb-6">
          {property.logo_url ? (
            <img src={property.logo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
          ) : <div className="h-10 w-10 rounded-lg" style={{ background: brand }} />}
          <div>
            <div className="font-serif text-xl">{property.name}</div>
            <div className="text-xs text-muted-foreground">Guest hub{offline ? " · offline" : ""}</div>
          </div>
        </div>

        <Tabs defaultValue="info">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="guidebook">Guidebook</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
          </TabsList>
          <TabsContent value="info" className="mt-4 space-y-3">
            {property.wifi_ssid && (
              <Panel icon={<Wifi className="h-4 w-4" />} title="Wifi">
                <div className="text-sm"><span className="text-muted-foreground">Network:</span> {property.wifi_ssid}</div>
                {property.wifi_password && <div className="text-sm"><span className="text-muted-foreground">Password:</span> <span className="font-mono">{property.wifi_password}</span></div>}
              </Panel>
            )}
            {(property.checkin_time || property.checkout_time) && (
              <Panel icon={<Clock className="h-4 w-4" />} title="Times">
                {property.checkin_time && <div className="text-sm"><span className="text-muted-foreground">Check-in:</span> {property.checkin_time}</div>}
                {property.checkout_time && <div className="text-sm"><span className="text-muted-foreground">Check-out:</span> {property.checkout_time}</div>}
              </Panel>
            )}
            {property.address && (
              <Panel icon={<MapPin className="h-4 w-4" />} title="Address">
                <div className="text-sm whitespace-pre-wrap">{property.address}</div>
              </Panel>
            )}
          </TabsContent>
          <TabsContent value="guidebook" className="mt-4 space-y-3">
            <Panel title="Around the property">
              <p className="text-sm text-muted-foreground">Breakfast is served in the courtyard from 8–10am. Ask the front desk for local recommendations, or use the chat.</p>
            </Panel>
            <Panel title="House rules">
              <p className="text-sm text-muted-foreground">Quiet hours after 10pm. No smoking indoors. Please recycle where marked.</p>
            </Panel>
          </TabsContent>
          <TabsContent value="chat" className="mt-4">
            <GuestChat propertyId={property.id} brand={brand} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Panel({ icon, title, children }: { icon?: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border p-4 bg-card">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">{icon}{title}</div>
      {children}
    </div>
  );
}

type PendingMsg = { local_id: string; body: string; created_at: string; seq: number; attempts: number };

function GuestChat({ propertyId, brand }: { propertyId: string; brand: string }) {
  const [conversationId, setConversationId] = useState<string | null>(() =>
    typeof localStorage !== "undefined" ? localStorage.getItem(`serai-conv-${propertyId}`) : null
  );
  const [name, setName] = useState<string>(() => (typeof localStorage !== "undefined" ? localStorage.getItem("serai-guest-name") || "" : ""));
  const [namePrompted, setNamePrompted] = useState(!!name);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [needsStaff, setNeedsStaff] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [notifyState, setNotifyState] = useState<NotifyPermission>("unsupported");
  const [notifyPrefs, setNotifyPrefs] = useState<NotifyPrefs>({ ai: true, staff: true, resolved: true });
  const [awaitingAi, setAwaitingAi] = useState(false);

  const [pending, setPending] = useState<PendingMsg[]>(() => {
    if (typeof localStorage === "undefined") return [];
    try {
      const raw = JSON.parse(localStorage.getItem(`serai-queue-${propertyId}`) || "[]") as PendingMsg[];
      return raw
        .map((p, i) => ({ ...p, seq: typeof p.seq === "number" ? p.seq : i, attempts: p.attempts ?? 0 }))
        .sort((a, b) => a.seq - b.seq);
    } catch { return []; }
  });
  const [online, setOnline] = useState<boolean>(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const seqRef = useRef<number>(Date.now());

  function nextSeq() {
    seqRef.current = Math.max(seqRef.current + 1, Date.now());
    return seqRef.current;
  }

  // persist queue (always ordered by seq)
  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(`serai-queue-${propertyId}`, JSON.stringify([...pending].sort((a, b) => a.seq - b.seq)));
    }
  }, [pending, propertyId]);

  // online/offline listeners
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // reflect any previously granted notification permission + saved per-kind prefs
  useEffect(() => {
    setNotifyState(notificationSupport());
    setNotifyPrefs(loadNotifyPrefs());
  }, []);

  function updatePref(kind: keyof NotifyPrefs, value: boolean) {
    setNotifyPrefs((prev) => {
      const next = { ...prev, [kind]: value };
      saveNotifyPrefs(next);
      return next;
    });
  }

  useEffect(() => {
    if (!conversationId) return;
    const loadInitial = async () => {
      const { data } = await supabase.from("messages").select("*").eq("conversation_id", conversationId).order("created_at").order("id");
      setMessages((data ?? []) as Msg[]);
      const { data: conv } = await supabase.from("conversations").select("needs_staff, resolved_at, status").eq("id", conversationId).maybeSingle();
      setNeedsStaff(!!conv?.needs_staff);
      setResolved(!!conv?.resolved_at || conv?.status === "closed");
    };
    loadInitial();
    const ch = supabase.channel(`guest-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as Msg;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.sender !== "guest") {
            setAwaitingAi(false);
            void notifyGuest(
              m.sender === "ai" ? "Answer from the concierge" : "A team member replied",
              m.body.length > 120 ? `${m.body.slice(0, 117)}…` : m.body,
              `serai-msg-${m.id}`,
            );
          }
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${conversationId}` },
        (payload) => {
          const next = payload.new as { needs_staff?: boolean; resolved_at?: string | null; status?: string };
          setNeedsStaff(!!next.needs_staff);
          const nowResolved = !!next.resolved_at || next.status === "closed";
          setResolved((prev) => {
            if (nowResolved && !prev) {
              void notifyGuest("Your request is handled", "Our team marked your conversation as resolved.", `serai-resolved-${conversationId}`);
            }
            return nowResolved;
          });
          if (next.needs_staff) {
            void notifyGuest("We're getting a team member", "Your question needs a human — someone will reply shortly.", `serai-escalated-${conversationId}`);
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId]);


  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, pending]);

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const existing = typeof localStorage !== "undefined" ? localStorage.getItem(`serai-conv-${propertyId}`) : null;
    if (existing) { setConversationId(existing); return existing; }
    const { data, error } = await supabase.from("conversations").insert({
      property_id: propertyId,
      guest_name: name || null,
      status: "open",
      last_message_at: new Date().toISOString(),
    }).select("id").single();
    if (error) throw error;
    setConversationId(data.id);
    if (typeof localStorage !== "undefined") localStorage.setItem(`serai-conv-${propertyId}`, data.id);
    return data.id;
  }

  // Idempotent delivery: client_msg_id is unique, so a retry of an already-stored
  // message is swallowed instead of duplicated. Returns true when delivered/known.
  async function pushOne(item: { local_id: string; body: string; created_at: string }, convId: string): Promise<boolean> {
    const { error } = await supabase.from("messages").insert({
      conversation_id: convId,
      sender: "guest",
      body: item.body,
      source: "manual",
      client_msg_id: item.local_id,
      created_at: item.created_at,
    });
    if (error) {
      // 23505 = unique violation -> already delivered by an earlier attempt
      if ((error as { code?: string }).code !== "23505") throw error;
      return true;
    }
    // a new guest question reopens the thread, so a previously resolved chat stops showing "Resolved"
    await supabase.from("conversations").update({ last_message_at: new Date().toISOString(), status: "open", resolved_at: null }).eq("id", convId);
    setResolved(false);

    setAwaitingAi(true);
    fetch("/api/ai/concierge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: convId, propertyId, question: item.body, clientMsgId: item.local_id }),
    }).catch(() => {});
    return true;
  }

  // flush queue when we come back online — strictly in order, one at a time
  useEffect(() => {
    if (!online || pending.length === 0 || syncingRef.current) return;
    syncingRef.current = true;
    (async () => {
      try {
        const convId = await ensureConversation();
        const queue = [...pending].sort((a, b) => a.seq - b.seq);
        for (const item of queue) {
          if (typeof navigator !== "undefined" && !navigator.onLine) break;
          try {
            await pushOne(item, convId);
            setPending((prev) => prev.filter((p) => p.local_id !== item.local_id));
          } catch {
            // keep order: stop at the first failure so later messages never overtake it
            setPending((prev) => prev.map((p) => p.local_id === item.local_id ? { ...p, attempts: p.attempts + 1 } : p));
            break;
          }
        }
      } catch { /* ignore */ }
      finally { syncingRef.current = false; }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, pending.length]);

  function enqueue(body: string) {
    setPending((prev) => [...prev, { local_id: crypto.randomUUID(), body, created_at: new Date().toISOString(), seq: nextSeq(), attempts: 0 }]);
  }

  async function send() {
    if (!text.trim()) return;
    const body = text.trim();
    setText("");

    // If anything is still queued, append to the queue so ordering is preserved.
    if (!online || pending.length > 0) {
      enqueue(body);
      toast.info(online ? "Queued behind earlier messages" : "Saved — will send when you're back online");
      return;
    }

    setSending(true);
    const item = { local_id: crypto.randomUUID(), body, created_at: new Date().toISOString() };
    try {
      const convId = await ensureConversation();
      await pushOne(item, convId);
    } catch (e) {
      // network failed mid-send: queue the SAME local_id so a retry can't duplicate
      setPending((prev) => [...prev, { ...item, seq: nextSeq(), attempts: 1 }]);
      toast.error(e instanceof Error ? `${e.message} — queued for retry` : "Queued for retry");
    } finally {
      setSending(false);
    }
  }

  const lastMessage = messages.length ? messages[messages.length - 1] : null;
  const status: { tone: string; dot: string; label: string } = !online
    ? { tone: "text-amber-800 bg-amber-50", dot: "bg-amber-500", label: "Offline — messages will send when reconnected" }
    : resolved
      ? { tone: "text-emerald-700 bg-emerald-50", dot: "bg-emerald-500", label: "Resolved — our team marked this as handled" }
      : needsStaff
        ? { tone: "text-amber-800 bg-amber-50", dot: "bg-amber-500", label: "A team member will respond shortly" }
        : awaitingAi || (lastMessage?.sender === "guest")
          ? { tone: "text-sky-800 bg-sky-50", dot: "bg-sky-500", label: "Concierge is looking that up…" }
          : lastMessage?.sender === "ai"
            ? { tone: "text-sky-800 bg-sky-50", dot: "bg-sky-500", label: "Answered by AI concierge" }
            : lastMessage?.sender === "staff"
              ? { tone: "text-emerald-700 bg-emerald-50", dot: "bg-emerald-500", label: "Answered by our team" }
              : { tone: "text-emerald-700 bg-emerald-50", dot: "bg-emerald-500", label: "Online" };

  if (!namePrompted) {
    return (
      <div className="rounded-2xl border border-border p-5 bg-card">
        <h3 className="font-serif text-lg">Hi there 👋</h3>
        <p className="text-sm text-muted-foreground mt-1">What should we call you?</p>
        <Input className="mt-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        <Button className="mt-3 w-full" style={{ background: brand, color: "white" }} onClick={() => {
          if (!name.trim()) return toast.error("Please enter your name");
          localStorage.setItem("serai-guest-name", name.trim());
          setNamePrompted(true);
        }}>Start chatting</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[65vh] rounded-2xl border border-border bg-card overflow-hidden">
      <div className={`px-3 py-1.5 text-[11px] flex items-center gap-1.5 border-b border-border ${status.tone}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${status.dot} ${status.label.endsWith("…") ? "animate-pulse" : ""}`} />
        {status.label}
        {pending.length > 0 && <span className="ml-2">{pending.length} pending</span>}
        {notifyState !== "unsupported" && (
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 underline underline-offset-2"
            onClick={async () => {
              if (notifyState === "granted") {
                setNotifyState("default");
                toast.info("Notifications paused for this device");
                return;
              }
              const next = await requestNotifyPermission();
              setNotifyState(next);
              if (next === "granted") toast.success("We'll notify you when we reply");
              else if (next === "denied") toast.error("Notifications blocked in your browser settings");
            }}
          >
            {notifyState === "granted" ? <><Bell className="h-3 w-3" /> Alerts on</> : <><BellOff className="h-3 w-3" /> Notify me</>}
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && pending.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Ask us anything about your stay — wifi, breakfast, local tips.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender === "guest" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
              m.sender === "guest" ? "text-white" : "bg-muted"
            }`} style={m.sender === "guest" ? { background: brand } : undefined}>
              {m.sender !== "guest" && (
                <div className="text-[10px] uppercase tracking-wide mb-0.5 opacity-60">
                  {m.sender === "ai" ? "AI concierge" : "Our team"}
                </div>
              )}
              {m.body}
            </div>
          </div>
        ))}
        {pending.map((p) => (
          <div key={p.local_id} className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl px-3.5 py-2 text-sm text-white opacity-60" style={{ background: brand }}>
              {p.body}
              <div className="text-[10px] mt-0.5 opacity-80">
                {p.attempts > 0 ? `Retrying (attempt ${p.attempts + 1})…` : online ? "Sending…" : "Pending — will send when online"}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border p-2 flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={online ? "Type a message…" : "Offline — will queue"} onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
        <Button size="icon" onClick={send} disabled={sending || !text.trim()} style={{ background: brand, color: "white" }}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

