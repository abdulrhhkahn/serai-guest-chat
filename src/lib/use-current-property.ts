import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

/**
 * Several pages fetch property-scoped data (conversations, check-ins)
 * relying entirely on RLS to filter by the caller's current property,
 * with no property id in the query's cache key. That's fine for RLS
 * correctness, but React Query then treats "conversations for property
 * A" and "conversations for property B" as the exact same cached query
 * — switching properties (which updates staff_profiles.property_id
 * server-side) doesn't change the key, so a previous property's cached
 * results can keep showing after switching, especially once persistence
 * and a non-zero staleTime are in play. Including this id in both the
 * query key and an explicit .eq() filter closes that gap properly,
 * rather than depending on cache invalidation firing at exactly the
 * right moment.
 */
export function useCurrentPropertyId() {
  return useQuery({
    queryKey: ["current-staff-property-id"],
    queryFn: async (): Promise<string | null> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data } = await supabase.from("staff_profiles").select("property_id").eq("id", auth.user.id).maybeSingle();
      return data?.property_id ?? null;
    },
  });
}
