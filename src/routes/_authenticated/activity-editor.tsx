import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2, Plus, ArrowUp, ArrowDown, ImagePlus, X } from "lucide-react";
import { compressImage } from "@/lib/compress-image";

export const Route = createFileRoute("/_authenticated/activity-editor")({
  component: ActivityEditorPage,
});

type Activity = {
  id: string;
  category: string;
  name: string;
  description: string | null;
  price_text: string | null;
  provider_name: string | null;
  provider_contact: string | null;
  display_order: number;
  image_url: string | null;
};

function ActivityEditorPage() {
  const qc = useQueryClient();
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [providerName, setProviderName] = useState("");
  const [providerContact, setProviderContact] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: property } = useQuery({
    queryKey: ["current-property"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data: prof } = await supabase.from("staff_profiles").select("property_id").eq("id", auth.user?.id ?? "").maybeSingle();
      if (!prof?.property_id) return null;
      const { data: p } = await supabase.from("properties").select("id, slug").eq("id", prof.property_id).maybeSingle();
      return p;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["activities-editor", property?.id],
    enabled: !!property?.id,
    queryFn: async (): Promise<Activity[]> => {
      const { data } = await supabase
        .from("local_activities")
        .select("id, category, name, description, price_text, provider_name, provider_contact, display_order, image_url")
        .eq("property_id", property!.id)
        .order("category")
        .order("display_order");
      return data ?? [];
    },
  });

  const grouped = (() => {
    const map = new Map<string, Activity[]>();
    for (const item of items ?? []) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return [...map.entries()];
  })();

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["activities-editor", property?.id] });
  }

  async function addItem() {
    if (!property?.id || !category.trim() || !name.trim()) return;
    setSaving(true);
    const existingInCategory = (items ?? []).filter((i) => i.category === category.trim()).length;
    const { error } = await supabase.from("local_activities").insert({
      property_id: property.id,
      category: category.trim(),
      name: name.trim(),
      description: description.trim() || null,
      price_text: price.trim() || null,
      provider_name: providerName.trim() || null,
      provider_contact: providerContact.trim() || null,
      display_order: existingInCategory,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Activity added");
    setName("");
    setDescription("");
    setPrice("");
    setProviderName("");
    setProviderContact("");
    invalidate();
  }

  async function removeItem(id: string) {
    const { error } = await supabase.from("local_activities").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    invalidate();
  }

  // Up/down buttons rather than drag-and-drop — same reasoning as the
  // menu editor: no drag library already in this project, and this
  // achieves the same outcome (control over order) more simply.
  async function moveItem(categoryItems: Activity[], index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= categoryItems.length) return;
    const a = categoryItems[index];
    const b = categoryItems[targetIndex];
    const { error: e1 } = await supabase.from("local_activities").update({ display_order: b.display_order }).eq("id", a.id);
    const { error: e2 } = await supabase.from("local_activities").update({ display_order: a.display_order }).eq("id", b.id);
    if (e1 || e2) return toast.error(e1?.message ?? e2?.message);
    invalidate();
  }

  async function uploadImage(item: Activity, file: File) {
    if (!property?.id) return;
    setUploadingId(item.id);
    const compressed = await compressImage(file);
    const ext = compressed.name.split(".").pop() ?? "jpg";
    const path = `${property.id}/${item.id}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("activity-images").upload(path, compressed, { upsert: true });
    if (uploadError) {
      setUploadingId(null);
      return toast.error(uploadError.message);
    }
    const { data } = supabase.storage.from("activity-images").getPublicUrl(path);
    const { error } = await supabase.from("local_activities").update({ image_url: data.publicUrl }).eq("id", item.id);
    setUploadingId(null);
    if (error) return toast.error(error.message);
    invalidate();
  }

  async function removeImage(item: Activity) {
    const { error } = await supabase.from("local_activities").update({ image_url: null }).eq("id", item.id);
    if (error) return toast.error(error.message);
    invalidate();
  }

  if (!property) {
    return (
      <div className="p-6 max-w-md">
        <p className="text-sm text-muted-foreground">Your account isn't linked to a property yet.</p>
      </div>
    );
  }

  const activitiesUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/activities/${property.slug}`;

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Local activities</h1>
        <p className="text-sm text-muted-foreground">
          Manage what guests see at{" "}
          <a href={activitiesUrl} target="_blank" rel="noreferrer" className="underline">{activitiesUrl}</a>
        </p>
      </div>

      <Card className="p-5 space-y-3">
        <h2 className="font-medium">Add an activity</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Category</Label>
            <Input className="mt-1" placeholder="City tours" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Name</Label>
            <Input className="mt-1" placeholder="Old town walking tour" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Description (optional)</Label>
          <Input className="mt-1" placeholder="2-hour guided walk through the historic quarter" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Price (optional)</Label>
            <Input className="mt-1" placeholder="PKR 2,500/person" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Provider name (optional)</Label>
            <Input className="mt-1" placeholder="City Walks Co." value={providerName} onChange={(e) => setProviderName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Provider phone (optional)</Label>
            <Input className="mt-1" placeholder="+92 300 1234567" value={providerContact} onChange={(e) => setProviderContact(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Provider phone lets guests contact them directly; leave it blank if you'd rather guests only ask your staff to arrange it.
        </p>
        <Button size="sm" onClick={addItem} disabled={saving || !category.trim() || !name.trim()}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> {saving ? "Adding…" : "Add activity"}
        </Button>
      </Card>

      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activities yet — add your first one above.</p>
      ) : (
        grouped.map(([cat, catItems]) => (
          <div key={cat} className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">{cat}</h3>
            <Card>
              {catItems.map((item, i) => (
                <div key={item.id} className={`flex items-center gap-3 p-3 ${i > 0 ? "border-t border-border" : ""}`}>
                  <div className="flex flex-col">
                    <button
                      title="Move up"
                      disabled={i === 0}
                      onClick={() => moveItem(catItems, i, -1)}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      title="Move down"
                      disabled={i === catItems.length - 1}
                      onClick={() => moveItem(catItems, i, 1)}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {item.image_url ? (
                    <div className="relative shrink-0">
                      <img src={item.image_url} alt={item.name} className="h-12 w-12 rounded-md object-cover" />
                      <button
                        title="Remove photo"
                        onClick={() => removeImage(item)}
                        className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      title="Add photo"
                      onClick={() => fileInputRefs.current[item.id]?.click()}
                      disabled={uploadingId === item.id}
                      className="h-12 w-12 rounded-md border border-dashed border-border flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <ImagePlus className="h-4 w-4" />
                    </button>
                  )}
                  <input
                    ref={(el) => { fileInputRefs.current[item.id] = el; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadImage(item, file);
                      e.target.value = "";
                    }}
                  />

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.name}</p>
                    {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                    {item.provider_name && (
                      <p className="text-xs text-muted-foreground">
                        {item.provider_name}{item.provider_contact ? ` · ${item.provider_contact}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {item.price_text && <p className="text-sm text-muted-foreground">{item.price_text}</p>}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeItem(item.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        ))
      )}
    </div>
  );
}
