import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/knowledge")({
  component: KnowledgePage,
});

type Faq = { id: string; question: string; answer: string; category: string | null; property_id: string };

function KnowledgePage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Faq | null>(null);
  const [open, setOpen] = useState(false);

  const { data: faqs } = useQuery({
    queryKey: ["faqs"],
    queryFn: async () => {
      const { data } = await supabase.from("faqs").select("*").order("category").order("question");
      return (data ?? []) as Faq[];
    },
  });

  async function remove(id: string) {
    if (!confirm("Delete this FAQ?")) return;
    const { error } = await supabase.from("faqs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["faqs"] });
  }

  const grouped = (faqs ?? []).reduce<Record<string, Faq[]>>((acc, f) => {
    const k = f.category || "General";
    (acc[k] ||= []).push(f);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Knowledge base</h1>
          <p className="text-sm text-muted-foreground">Powers the AI concierge that answers guest questions.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}><Plus className="mr-2 h-4 w-4" /> Add FAQ</Button>
          </DialogTrigger>
          <FaqDialog editing={editing} onDone={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["faqs"] }); }} />
        </Dialog>
      </div>

      {!faqs?.length ? (
        <Card className="p-10 text-center text-muted-foreground text-sm">
          No FAQs yet. Add your first one to help the AI concierge answer guests.
        </Card>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">{cat}</h3>
              <div className="space-y-2">
                {items.map((f) => (
                  <Card key={f.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-medium">{f.question}</div>
                        <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{f.answer}</div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => { setEditing(f); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(f.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FaqDialog({ editing, onDone }: { editing: Faq | null; onDone: () => void }) {
  const [question, setQuestion] = useState(editing?.question ?? "");
  const [answer, setAnswer] = useState(editing?.answer ?? "");
  const [category, setCategory] = useState(editing?.category ?? "");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    if (editing) {
      const { error } = await supabase.from("faqs").update({ question, answer, category: category || null }).eq("id", editing.id);
      if (error) { setSaving(false); return toast.error(error.message); }
    } else {
      const { data: prof } = await supabase.from("staff_profiles").select("property_id").maybeSingle();
      if (!prof?.property_id) { setSaving(false); return toast.error("No property linked"); }
      const { error } = await supabase.from("faqs").insert({ question, answer, category: category || null, property_id: prof.property_id });
      if (error) { setSaving(false); return toast.error(error.message); }
    }
    toast.success("Saved");
    setSaving(false);
    onDone();
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{editing ? "Edit FAQ" : "New FAQ"}</DialogTitle></DialogHeader>
      <form onSubmit={save} className="space-y-4">
        <div><Label>Question</Label><Input value={question} onChange={(e) => setQuestion(e.target.value)} required /></div>
        <div><Label>Answer</Label><Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} required rows={5} /></div>
        <div><Label>Category (optional)</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Wifi, Breakfast" /></div>
        <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving…" : "Save"}</Button>
      </form>
    </DialogContent>
  );
}
