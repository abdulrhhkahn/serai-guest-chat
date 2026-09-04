import { createFileRoute, notFound } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

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

type MenuItem = { id: string; category: string; name: string; description: string | null; price_text: string | null };

function MenuPage() {
  const { property } = Route.useLoaderData();
  const brand = property.brand_color || "#0b6b75";

  const { data: items, isLoading } = useQuery({
    queryKey: ["menu-items", property.id],
    queryFn: async (): Promise<MenuItem[]> => {
      const { data } = await supabase
        .from("menu_items")
        .select("id, category, name, description, price_text")
        .eq("property_id", property.id)
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

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading menu…</p>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground">The menu isn't available yet — please check with a staff member.</p>
        ) : (
          <div className="space-y-6">
            {grouped.map(([category, categoryItems]) => (
              <div key={category}>
                <h2 className="font-serif text-lg mb-2" style={{ color: brand }}>{category}</h2>
                <div className="space-y-3">
                  {categoryItems.map((item) => (
                    <div key={item.id} className="bg-white rounded-lg border border-border p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{item.name}</p>
                        {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
                      </div>
                      {item.price_text && <p className="text-sm font-medium shrink-0">{item.price_text}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
