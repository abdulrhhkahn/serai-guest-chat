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

export const Route = createFileRoute("/_authenticated/menu-editor")({
  component: MenuEditorPage,
});

type MenuItem = { id: string; category: string; name: string; description: string | null; price_text: string | null; display_order: number; image_url: string | null };
type MenuRow = { id: string; name: string; display_order: number };

function MenuEditorPage() {
  const qc = useQueryClient();
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [newMenuName, setNewMenuName] = useState("");
  const [creatingMenu, setCreatingMenu] = useState(false);

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

  const { data: menus } = useQuery({
    queryKey: ["menus-editor", property?.id],
    enabled: !!property?.id,
    queryFn: async (): Promise<MenuRow[]> => {
      const { data } = await supabase.from("menus").select("id, name, display_order").eq("property_id", property!.id).order("display_order");
      return data ?? [];
    },
  });

  // Default to the first menu once loaded, without fighting the user's
  // own selection afterward (same reasoning as Inbox's old auto-select
  // guard, just simpler here since there's no "close" action to protect).
  const resolvedActiveMenuId = activeMenuId ?? menus?.[0]?.id ?? null;

  async function createMenu() {
    if (!property?.id || !newMenuName.trim()) return;
    setCreatingMenu(true);
    const { data, error } = await supabase
      .from("menus")
      .insert({ property_id: property.id, name: newMenuName.trim(), display_order: menus?.length ?? 0 })
      .select("id")
      .single();
    setCreatingMenu(false);
    if (error) return toast.error(error.message);
    toast.success("Menu created");
    setNewMenuName("");
    setActiveMenuId(data.id);
    qc.invalidateQueries({ queryKey: ["menus-editor", property.id] });
  }

  async function deleteMenu(id: string) {
    const { error } = await supabase.from("menus").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Menu deleted");
    if (activeMenuId === id) setActiveMenuId(null);
    qc.invalidateQueries({ queryKey: ["menus-editor", property?.id] });
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

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {menus?.map((m) => (
            <div key={m.id} className="flex items-center">
              <button
                onClick={() => setActiveMenuId(m.id)}
                className={`rounded-l-full rounded-r-none px-3 py-1.5 text-sm border ${resolvedActiveMenuId === m.id ? "bg-brand text-brand-foreground border-brand" : "border-border text-muted-foreground"}`}
              >
                {m.name}
              </button>
              <button
                title="Delete menu"
                onClick={() => deleteMenu(m.id)}
                className={`rounded-r-full rounded-l-none px-2 py-1.5 border border-l-0 text-xs ${resolvedActiveMenuId === m.id ? "bg-brand text-brand-foreground border-brand" : "border-border text-muted-foreground"} hover:text-destructive`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-1.5 ml-2">
            <Input
              value={newMenuName}
              onChange={(e) => setNewMenuName(e.target.value)}
              placeholder="e.g. Breakfast, Dinner"
              className="h-8 w-40 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") createMenu(); }}
            />
            <Button size="sm" variant="outline" className="h-8" onClick={createMenu} disabled={creatingMenu || !newMenuName.trim()}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New menu
            </Button>
          </div>
        </div>
      </Card>

      {resolvedActiveMenuId ? (
        <MenuContent key={resolvedActiveMenuId} menuId={resolvedActiveMenuId} propertyId={property.id} />
      ) : (
        <p className="text-sm text-muted-foreground">Create a menu above to start adding items.</p>
      )}
    </div>
  );
}

function MenuContent({ menuId, propertyId }: { menuId: string; propertyId: string }) {
  const qc = useQueryClient();
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: items } = useQuery({
    queryKey: ["menu-items-editor", menuId],
    queryFn: async (): Promise<MenuItem[]> => {
      const { data } = await supabase
        .from("menu_items")
        .select("id, category, name, description, price_text, display_order, image_url")
        .eq("menu_id", menuId)
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

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["menu-items-editor", menuId] });
  }

  async function addItem() {
    if (!category.trim() || !name.trim()) return;
    setSaving(true);
    const existingInCategory = (items ?? []).filter((i) => i.category === category.trim()).length;
    const { error } = await supabase.from("menu_items").insert({
      property_id: propertyId,
      menu_id: menuId,
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
    invalidate();
  }

  async function removeItem(id: string) {
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Item removed");
    invalidate();
  }

  // Reordering via up/down buttons rather than drag-and-drop — same
  // outcome (items reorder), simpler and more reliable to build than
  // wiring up a full drag library for a same-page swap. Scoped to
  // within the same category, matching how items are visually grouped.
  async function moveItem(categoryItems: MenuItem[], index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= categoryItems.length) return;
    const a = categoryItems[index];
    const b = categoryItems[targetIndex];
    const { error: e1 } = await supabase.from("menu_items").update({ display_order: b.display_order }).eq("id", a.id);
    const { error: e2 } = await supabase.from("menu_items").update({ display_order: a.display_order }).eq("id", b.id);
    if (e1 || e2) return toast.error(e1?.message ?? e2?.message);
    invalidate();
  }

  async function uploadImage(item: MenuItem, file: File) {
    setUploadingId(item.id);
    const compressed = await compressImage(file);
    const ext = compressed.name.split(".").pop() ?? "jpg";
    const path = `${propertyId}/${item.id}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("menu-images").upload(path, compressed, { upsert: true });
    if (uploadError) {
      setUploadingId(null);
      return toast.error(uploadError.message);
    }
    const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
    const { error } = await supabase.from("menu_items").update({ image_url: data.publicUrl }).eq("id", item.id);
    setUploadingId(null);
    if (error) return toast.error(error.message);
    invalidate();
  }

  async function removeImage(item: MenuItem) {
    const { error } = await supabase.from("menu_items").update({ image_url: null }).eq("id", item.id);
    if (error) return toast.error(error.message);
    invalidate();
  }

  return (
    <>
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
        <p className="text-xs text-muted-foreground">Add a photo after creating the item, from its row below.</p>
        <Button size="sm" onClick={addItem} disabled={saving || !category.trim() || !name.trim()}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> {saving ? "Adding…" : "Add item"}
        </Button>
      </Card>

      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">No items in this menu yet — add your first one above.</p>
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
    </>
  );
}
