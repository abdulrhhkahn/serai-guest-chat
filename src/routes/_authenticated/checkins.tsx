import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { format, isToday, isTomorrow, isYesterday } from "date-fns";

export const Route = createFileRoute("/_authenticated/checkins")({
  component: CheckinsPage,
});

// Hard cap on a single fetch — without this the query pulls every
// check-in ever recorded for the property, unpaginated, on every page
// load. 300 comfortably covers a busy hotel's active list; a property
// that regularly exceeds it would need real cursor-based pagination
// (load older records on demand) rather than this fixed limit, which is
// the right next step if that ever becomes the actual bottleneck.
const FETCH_LIMIT = 300;

type Checkin = {
  id: string;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  booking_reference: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  num_guests: number | null;
  room: string | null;
  id_document_url: string | null;
  signature_url: string | null;
  status: string;
  created_at: string;
};

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  verified: "bg-blue-100 text-blue-900",
  completed: "bg-emerald-100 text-emerald-900",
};

function dateGroupLabel(dateStr: string | null): string {
  if (!dateStr) return "No arrival date";
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, MMM d");
}

function CheckinsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"all" | "pending" | "verified" | "completed">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Checkin | null>(null);
  const [idUrl, setIdUrl] = useState<string | null>(null);
  const [sigUrl, setSigUrl] = useState<string | null>(null);

  const { data: checkins } = useQuery({
    queryKey: ["checkins", status],
    queryFn: async () => {
      let q = supabase
        .from("checkins")
        .select("*")
        .order("arrival_date", { ascending: true, nullsFirst: false })
        .limit(FETCH_LIMIT);
      if (status !== "all") q = q.eq("status", status);
      const { data } = await q;
      return (data ?? []) as Checkin[];
    },
  });

  // Search filters guest name or booking ref, on top of whichever tab is
  // active — client-side since the fetch is already capped to a
  // reasonable size, no need for a server round-trip per keystroke.
  const filtered = useMemo(() => {
    const list = checkins ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) => c.guest_name.toLowerCase().includes(q) || (c.booking_reference ?? "").toLowerCase().includes(q),
    );
  }, [checkins, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Checkin[]>();
    for (const c of filtered) {
      const label = dateGroupLabel(c.arrival_date);
      const list = map.get(label) ?? [];
      list.push(c);
      map.set(label, list);
    }
    return [...map.entries()];
  }, [filtered]);

  async function openDetail(c: Checkin) {
    setSelected(c);
    setIdUrl(null);
    setSigUrl(null);
    if (c.id_document_url) {
      const { data } = await supabase.storage.from("guest-ids").createSignedUrl(c.id_document_url, 600);
      setIdUrl(data?.signedUrl ?? null);
    }
    if (c.signature_url) {
      const { data } = await supabase.storage.from("guest-signatures").createSignedUrl(c.signature_url, 600);
      setSigUrl(data?.signedUrl ?? null);
    }
  }

  async function updateStatus(id: string, newStatus: string) {
    const { error } = await supabase.from("checkins").update({ status: newStatus }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${newStatus}`);
    qc.invalidateQueries({ queryKey: ["checkins"] });
    setSelected((s) => (s ? { ...s, status: newStatus } : s));
  }

  async function assignRoom(id: string, room: string) {
    const value = room.trim() || null;
    const { error } = await supabase.from("checkins").update({ room: value }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(value ? `Room ${value} assigned` : "Room cleared");
    qc.invalidateQueries({ queryKey: ["checkins"] });
    qc.invalidateQueries({ queryKey: ["conversation-checkin"] });
    setSelected((s) => (s ? { ...s, room: value } : s));
  }

  return (
    <div className="p-6 space-y-4 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Check-ins</h1>
          <p className="text-sm text-muted-foreground">Review and verify guest arrivals.</p>
        </div>
        <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="verified">Verified</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by guest name or booking ref…"
          className="pl-9"
        />
      </div>

      {!filtered.length ? (
        <Card className="py-10 text-center text-sm text-muted-foreground">
          {search.trim() ? "No check-ins match your search." : "No check-ins yet."}
        </Card>
      ) : (
        grouped.map(([label, rows]) => (
          <div key={label} className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guest</TableHead>
                    <TableHead>Arrival</TableHead>
                    <TableHead>Departure</TableHead>
                    <TableHead>Booking ref</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => (
                    <TableRow key={c.id} onClick={() => openDetail(c)} className="cursor-pointer">
                      <TableCell className="font-medium">{c.guest_name}</TableCell>
                      <TableCell>{c.arrival_date ? format(new Date(c.arrival_date), "MMM d") : "—"}</TableCell>
                      <TableCell>{c.departure_date ? format(new Date(c.departure_date), "MMM d") : "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{c.booking_reference ?? "—"}</TableCell>
                      <TableCell><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[c.status] ?? "bg-muted"}`}>{c.status}</span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        ))
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.guest_name}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                <Field label="Email" value={selected.guest_email} />
                <Field label="Phone" value={selected.guest_phone} />
                <Field label="Booking reference" value={selected.booking_reference} />
                <Field label="Arrival" value={selected.arrival_date} />
                <Field label="Departure" value={selected.departure_date} />
                <Field label="Guests" value={String(selected.num_guests ?? 1)} />
                <Field label="Status" value={selected.status} />

                <div>
                  <Label className="text-xs text-muted-foreground">Room</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      defaultValue={selected.room ?? ""}
                      placeholder="e.g. 204"
                      key={selected.id}
                      onBlur={(e) => { if ((e.target.value.trim() || null) !== (selected.room ?? null)) assignRoom(selected.id, e.target.value); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Shows as stay context in the inbox.</p>
                </div>

                {idUrl && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">ID document</div>
                    <img src={idUrl} alt="ID" className="w-full rounded-lg border border-border" />
                  </div>
                )}
                {sigUrl && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Signature</div>
                    <img src={sigUrl} alt="Signature" className="w-full rounded-lg border border-border bg-white p-2" />
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={() => updateStatus(selected.id, "verified")} disabled={selected.status === "verified"}>
                    Mark verified
                  </Button>
                  <Button onClick={() => updateStatus(selected.id, "completed")} disabled={selected.status === "completed"}>
                    Mark completed
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div>{value || "—"}</div>
    </div>
  );
}
