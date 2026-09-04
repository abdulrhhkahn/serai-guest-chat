import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/menu-editor")({
  component: MenuEditorPage,
});

type MenuItem = { id: string; category: string; name: string; description: string | null; price_text: string | null; display_order: number };

function MenuEditorPage() {
  const qc = useQueryClient();
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

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
    queryKey: ["menu-items-editor", property?.id],
    enabled: !!property?.id,
    queryFn: async (): Promise<MenuItem[]> => {
      const { data } = await supabase
        .from("menu_items")
        .select("id, category, name, description, price_text, display_order")
        .eq("property_id", property!.id)
        .order("category")
        .order("display_order");
      return data ?? [];
    },
  });

  const grouped = (() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of items ?? []) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return [...map.entries()];
  })();

  async function addItem() {
    if (!property?.id || !category.trim() || !name.trim()) return;
    setSaving(true);
    const existingInCategory = (items ?? []).filter((i) => i.category === category.trim()).length;
    const { error } = await supabase.from("menu_items").insert({
      property_id: property.id,
      category: category.trim(),
      name: name.trim(),
      description: description.trim() || null,
      price_text: price.trim() || null,
      display_order: existingInCategory,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Item added");
    setName("");
    setDescription("");
    setPrice("");
    qc.invalidateQueries({ queryKey: ["menu-items-editor", property.id] });
  }

  async function removeItem(id: string) {
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Item removed");
    qc.invalidateQueries({ queryKey: ["menu-items-editor", property?.id] });
  }

  if (!property) {
    return (
      <div className="p-6 max-w-md">
        <p className="text-sm text-muted-foreground">Your account isn't linked to a property yet.</p>
      </div>
    );
  }

  const menuUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/menu/${property.slug}`;

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Menu</h1>
        <p className="text-sm text-muted-foreground">
          Manage what guests see at{" "}
          <a href={menuUrl} target="_blank" rel="noreferrer" className="underline">{menuUrl}</a>
        </p>
      </div>

      <Card className="p-5 space-y-3">
        <h2 className="font-medium">Add an item</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Category</Label>
            <Input className="mt-1" placeholder="Breakfast" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Name</Label>
            <Input className="mt-1" placeholder="Club sandwich" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Input className="mt-1" placeholder="Grilled chicken, lettuce, tomato" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Price (optional)</Label>
            <Input className="mt-1 w-28" placeholder="PKR 1,200" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
        </div>
        <Button size="sm" onClick={addItem} disabled={saving || !category.trim() || !name.trim()}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> {saving ? "Adding…" : "Add item"}
        </Button>
      </Card>

      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">No menu items yet — add your first one above.</p>
      ) : (
        grouped.map(([cat, catItems]) => (
          <div key={cat} className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">{cat}</h3>
            <Card>
              {catItems.map((item, i) => (
                <div key={item.id} className={`flex items-center justify-between gap-3 p-3 ${i > 0 ? "border-t border-border" : ""}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.name}</p>
                    {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
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
