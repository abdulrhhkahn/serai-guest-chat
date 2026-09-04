import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ensureGuestConversation } from "@/lib/guest-conversation";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Phone, MessageCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/activities/$slug")({
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
      { title: loaderData ? `Local activities — ${loaderData.property.name}` : "Local activities" },
      { name: "description", content: "Discover local activities and tours." },
      { name: "theme-color", content: loaderData?.property.brand_color ?? "#0b6b75" },
    ],
  }),
  component: ActivitiesPage,
});

type Activity = {
  id: string;
  category: string;
  name: string;
  description: string | null;
  price_text: string | null;
  provider_name: string | null;
  provider_contact: string | null;
  image_url: string | null;
};

function ActivitiesPage() {
  const { property } = Route.useLoaderData();
  const navigate = useNavigate();
  const brand = property.brand_color || "#0b6b75";
  const [inquiringId, setInquiringId] = useState<string | null>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ["local-activities", property.id],
    queryFn: async (): Promise<Activity[]> => {
      const { data } = await supabase
        .from("local_activities")
        .select("id, category, name, description, price_text, provider_name, provider_contact, image_url")
        .eq("property_id", property.id)
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

  // "Inquire" just sends a plain guest message into the same conversation
  // the chat page uses — staff arrange it from there, same as an order.
  // No booking record, no status — it's a message, nothing more.
  async function inquire(activity: Activity) {
    setInquiringId(activity.id);
    try {
      const convId = await ensureGuestConversation(property.id);
      const body = `I'm interested in "${activity.name}" — could you help me arrange this?`;
      const { error } = await supabase.from("messages").insert({
        conversation_id: convId,
        sender: "guest",
        body,
        source: "manual",
      });
      if (error) throw error;
      await supabase.from("conversations").update({ last_message_at: new Date().toISOString(), status: "open", resolved_at: null }).eq("id", convId);
      toast.success("Sent — opening your chat…");
      navigate({ to: "/stay/$slug", params: { slug: property.slug } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send your inquiry — please try again.");
    } finally {
      setInquiringId(null);
    }
  }

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
            <p className="text-xs text-muted-foreground">Local activities & tours</p>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing listed yet — please check with a staff member.</p>
        ) : (
          <div className="space-y-6">
            {grouped.map(([category, categoryItems]) => (
              <div key={category}>
                <h2 className="font-serif text-lg mb-2" style={{ color: brand }}>{category}</h2>
                <div className="space-y-3">
                  {categoryItems.map((item) => (
                    <div key={item.id} className="bg-white rounded-lg border border-border p-3">
                      <div className="flex items-start gap-3">
                        {item.image_url && (
                          <img src={item.image_url} alt={item.name} loading="lazy" className="h-16 w-16 rounded-md object-cover shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="font-medium text-sm">{item.name}</p>
                            {item.price_text && <p className="text-sm font-medium shrink-0">{item.price_text}</p>}
                          </div>
                          {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
                          {item.provider_name && (
                            <p className="text-xs text-muted-foreground mt-1">Provided by {item.provider_name}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => inquire(item)}
                          disabled={inquiringId === item.id}
                          className="flex-1 h-9 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 text-white disabled:opacity-60"
                          style={{ background: brand }}
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          {inquiringId === item.id ? "Sending…" : "Ask the hotel to arrange"}
                        </button>
                        {item.provider_contact && (
                          <a
                            href={`tel:${item.provider_contact}`}
                            className="flex-1 h-9 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 border"
                            style={{ borderColor: `${brand}55`, color: brand }}
                          >
                            <Phone className="h-3.5 w-3.5" />
                            Contact provider
                          </a>
                        )}
                      </div>
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
