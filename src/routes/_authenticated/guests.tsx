import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useCurrentPropertyId } from "@/lib/use-current-property";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/guests")({
  component: GuestsPage,
});

type Guest = {
  id: string;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  room: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  num_guests: number | null;
  preferences: string | null;
  booking_reference: string | null;
};

function GuestsPage() {
  const { data: propertyId } = useCurrentPropertyId();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Guest | null>(null);

  const { data: guests, isLoading } = useQuery({
    queryKey: ["guests-record", propertyId],
    enabled: !!propertyId,
    queryFn: async (): Promise<Guest[]> => {
      const { data } = await supabase
        .from("checkins")
        .select("id, guest_name, guest_email, guest_phone, room, arrival_date, departure_date, num_guests, preferences, booking_reference")
        .eq("property_id", propertyId!)
        .order("arrival_date", { ascending: false, nullsFirst: false });
      return data ?? [];
    },
  });

  const filtered = (guests ?? []).filter((g) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return g.guest_name.toLowerCase().includes(q) || (g.room ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="font-serif text-3xl">Guests</h1>
        <p className="text-sm text-muted-foreground">Guest details, preferences, and internal notes.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or room…" className="pl-9" />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !filtered.length ? (
        <Card className="py-10 text-center text-sm text-muted-foreground">No guests match.</Card>
      ) : (
        <Card>
          {filtered.map((g, i) => (
            <button
              key={g.id}
              onClick={() => setSelected(g)}
              className={`w-full text-left flex items-center justify-between gap-4 p-3 hover:bg-muted/40 ${i > 0 ? "border-t border-border" : ""}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{g.guest_name}</p>
                <p className="text-xs text-muted-foreground">
                  {g.room ? `Room ${g.room} · ` : ""}
                  {g.arrival_date ? format(new Date(g.arrival_date), "MMM d") : "—"}
                  {" → "}
                  {g.departure_date ? format(new Date(g.departure_date), "MMM d") : "—"}
                </p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{g.num_guests ?? 1} guest{(g.num_guests ?? 1) !== 1 ? "s" : ""}</span>
            </button>
          ))}
        </Card>
      )}

      {selected && (
        <GuestDetailSheet guest={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

type NoteRow = { id: string; note: string; created_at: string };
type MessageRow = { id: string; sender: string; body: string; created_at: string };

function GuestDetailSheet({ guest, onClose }: { guest: Guest; onClose: () => void }) {
  const qc = useQueryClient();
  const [preferences, setPreferences] = useState(guest.preferences ?? "");
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const { data: notes } = useQuery({
    queryKey: ["guest-notes", guest.id],
    queryFn: async (): Promise<NoteRow[]> => {
      const { data } = await supabase.from("guest_notes").select("id, note, created_at").eq("checkin_id", guest.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // "Previous interactions" — the conversation linked to this stay, shown
  // read-only. A guest can have more than one conversation over time in
  // principle, but in practice each stay's ensureGuestConversation reuses
  // one thread per property, so this covers what actually exists.
  const { data: messages } = useQuery({
    queryKey: ["guest-messages", guest.id],
    queryFn: async (): Promise<MessageRow[]> => {
      const { data: conv } = await supabase.from("conversations").select("id").eq("checkin_id", guest.id).maybeSingle();
      if (!conv) return [];
      const { data } = await supabase.from("messages").select("id, sender, body, created_at").eq("conversation_id", conv.id).order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  async function savePreferences() {
    setSavingPrefs(true);
    const { error } = await supabase.from("checkins").update({ preferences: preferences.trim() || null }).eq("id", guest.id);
    setSavingPrefs(false);
    if (error) return toast.error(error.message);
    toast.success("Preferences saved");
    qc.invalidateQueries({ queryKey: ["guests-record"] });
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    const { data: auth } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from("staff_profiles").select("property_id").eq("id", auth.user?.id ?? "").maybeSingle();
    if (!prof?.property_id) {
      setSavingNote(false);
      return toast.error("Couldn't determine your property — please try again.");
    }
    const { error } = await supabase.from("guest_notes").insert({
      checkin_id: guest.id,
      property_id: prof.property_id,
      staff_id: auth.user?.id,
      note: newNote.trim(),
    });
    setSavingNote(false);
    if (error) return toast.error(error.message);
    setNewNote("");
    qc.invalidateQueries({ queryKey: ["guest-notes", guest.id] });
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{guest.guest_name}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-6">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><Label className="text-xs">Room</Label><p>{guest.room ?? "—"}</p></div>
            <div><Label className="text-xs">Guests</Label><p>{guest.num_guests ?? 1}</p></div>
            <div><Label className="text-xs">Arrival</Label><p>{guest.arrival_date ? format(new Date(guest.arrival_date), "MMM d, yyyy") : "—"}</p></div>
            <div><Label className="text-xs">Departure</Label><p>{guest.departure_date ? format(new Date(guest.departure_date), "MMM d, yyyy") : "—"}</p></div>
            <div><Label className="text-xs">Email</Label><p className="truncate">{guest.guest_email ?? "—"}</p></div>
            <div><Label className="text-xs">Phone</Label><p>{guest.guest_phone ?? "—"}</p></div>
            <div className="col-span-2"><Label className="text-xs">Booking ref</Label><p>{guest.booking_reference ?? "—"}</p></div>
          </div>

          <div>
            <Label className="text-xs">Preferences</Label>
            <Textarea className="mt-1" placeholder="e.g. vegetarian, high floor, extra pillows" value={preferences} onChange={(e) => setPreferences(e.target.value)} />
            <Button size="sm" className="mt-2" onClick={savePreferences} disabled={savingPrefs}>
              {savingPrefs ? "Saving…" : "Save preferences"}
            </Button>
          </div>

          <div>
            <Label className="text-xs">Internal notes</Label>
            <p className="text-[11px] text-muted-foreground mb-2">Only visible to staff — never shown to the guest.</p>
            <div className="flex gap-2 mb-3">
              <Input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a note…" onKeyDown={(e) => { if (e.key === "Enter") addNote(); }} />
              <Button size="sm" onClick={addNote} disabled={!newNote.trim() || savingNote}>Add</Button>
            </div>
            <div className="space-y-2">
              {!notes?.length ? (
                <p className="text-xs text-muted-foreground">No notes yet.</p>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className="bg-muted/40 rounded-md p-2 text-sm">
                    <p>{n.note}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <Label className="text-xs">Previous interactions</Label>
            <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
              {!messages?.length ? (
                <p className="text-xs text-muted-foreground">No conversation history for this stay.</p>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender === "guest" ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[85%] rounded-md px-2.5 py-1.5 text-xs ${m.sender === "guest" ? "bg-muted" : "bg-primary text-primary-foreground"}`}>
                      {m.body}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
