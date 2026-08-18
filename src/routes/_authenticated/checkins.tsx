import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/checkins")({
  component: CheckinsPage,
});

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

function CheckinsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"all" | "pending" | "verified" | "completed">("all");
  const [selected, setSelected] = useState<Checkin | null>(null);
  const [idUrl, setIdUrl] = useState<string | null>(null);
  const [sigUrl, setSigUrl] = useState<string | null>(null);

  const { data: checkins } = useQuery({
    queryKey: ["checkins", status],
    queryFn: async () => {
      let q = supabase.from("checkins").select("*").order("created_at", { ascending: false });
      if (status !== "all") q = q.eq("status", status);
      const { data } = await q;
      return (data ?? []) as Checkin[];
    },
  });

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
      <div className="flex items-center justify-between gap-4">
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
            {!checkins?.length ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">No check-ins yet.</TableCell></TableRow>
            ) : checkins.map((c) => (
              <TableRow key={c.id} onClick={() => openDetail(c)} className="cursor-pointer">
                <TableCell className="font-medium">{c.guest_name}</TableCell>
                <TableCell>{c.arrival_date ? format(new Date(c.arrival_date), "MMM d") : "—"}</TableCell>
                <TableCell>{c.departure_date ? format(new Date(c.departure_date), "MMM d") : "—"}</TableCell>
                <TableCell className="text-muted-foreground">{c.booking_reference ?? "—"}</TableCell>
                <TableCell><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{c.status}</span></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

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
