import { createFileRoute, notFound } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/menu/$slug")({
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("properties")
      .select("id, name, slug, logo_url, brand_color")
      .eq("slug", params.slug)
      .maybeSingle();
    if (!data) throw notFound();
    return { property: data };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `Menu — ${loaderData.property.name}` : "Menu" },
      { name: "description", content: "Browse the menu." },
      { name: "theme-color", content: loaderData?.property.brand_color ?? "#0b6b75" },
    ],
  }),
  component: MenuPage,
});

type MenuItem = { id: string; category: string; name: string; description: string | null; price_text: string | null; image_url: string | null };
type Menu = { id: string; name: string; display_order: number };

function MenuPage() {
  const { property } = Route.useLoaderData();
  const brand = property.brand_color || "#0b6b75";
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const { data: menus, isLoading: menusLoading } = useQuery({
    queryKey: ["menus", property.id],
    queryFn: async (): Promise<Menu[]> => {
      const { data } = await supabase
        .from("menus")
        .select("id, name, display_order")
        .eq("property_id", property.id)
        .order("display_order");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (menus && menus.length > 0 && !activeMenuId) setActiveMenuId(menus[0].id);
  }, [menus, activeMenuId]);

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ["menu-items", activeMenuId],
    enabled: !!activeMenuId,
    queryFn: async (): Promise<MenuItem[]> => {
      const { data } = await supabase
        .from("menu_items")
        .select("id, category, name, description, price_text, image_url")
        .eq("menu_id", activeMenuId!)
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

  return (
    <div className="min-h-screen" style={{ background: "#fcf8f0" }}>
      <div className="max-w-lg mx-auto p-4 pb-16">
        <div className="flex items-center gap-3 py-6">
          {property.logo_url ? (
            <img src={property.logo_url} alt={property.name} className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-lg" style={{ background: brand }} />
          )}
          <div>
            <p className="font-serif text-xl">{property.name}</p>
            <p className="text-xs text-muted-foreground">Menu</p>
          </div>
        </div>

        {menusLoading ? (
          <p className="text-sm text-muted-foreground">Loading menu…</p>
        ) : !menus?.length ? (
          <p className="text-sm text-muted-foreground">The menu isn't available yet — please check with a staff member.</p>
        ) : (
          <>
            {menus.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-4 -mx-1 px-1">
                {menus.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setActiveMenuId(m.id)}
                    className="shrink-0 rounded-full px-4 py-1.5 text-sm border transition"
                    style={
                      activeMenuId === m.id
                        ? { background: brand, color: "white", borderColor: brand }
                        : { borderColor: "rgba(0,0,0,0.12)", color: "#555" }
                    }
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}

            {itemsLoading ? (
              <p className="text-sm text-muted-foreground">Loading items…</p>
            ) : grouped.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing on this menu yet.</p>
            ) : (
              <div className="space-y-6">
                {grouped.map(([category, categoryItems]) => (
                  <div key={category}>
                    <h2 className="font-serif text-lg mb-2" style={{ color: brand }}>{category}</h2>
                    <div className="space-y-3">
                      {categoryItems.map((item) => (
                        <div key={item.id} className="bg-white rounded-lg border border-border p-3 flex items-start gap-3">
                          {item.image_url && (
                            <img src={item.image_url} alt={item.name} className="h-16 w-16 rounded-md object-cover shrink-0" />
                          )}
                          <div className="min-w-0 flex-1 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium text-sm">{item.name}</p>
                              {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
                            </div>
                            {item.price_text && <p className="text-sm font-medium shrink-0">{item.price_text}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
