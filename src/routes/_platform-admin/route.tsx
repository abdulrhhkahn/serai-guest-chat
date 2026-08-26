import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Building2, Users, UserX, MessageCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { playNotificationSound } from "@/lib/notification-sound";

/**
 * Separate pathless layout from _authenticated — deliberately does NOT
 * reuse that layout's hotel sidebar (property switcher, guest-ops nav).
 * This is Abdul's own internal tool, not something a hotel admin should
 * ever see the chrome of.
 *
 * Two independent gates, neither of which a hotel's own staff account can
 * satisfy on its own:
 *   1. Supabase session + the site-wide `admin` role
 *   2. A separate passphrase (see /admin-login, /api/admin/verify-passphrase)
 *      that isn't part of the Supabase user database at all
 * Missing either sends you to /admin-login, not the regular staff /auth
 * page — this surface is never reachable through the shared staff sign-in.
 */
export const Route = createFileRoute("/_platform-admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user || data.user.is_anonymous) throw redirect({ to: "/admin-login" });

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) throw redirect({ to: "/admin-login" });

    if (!sessionStorage.getItem("admin_gate_token")) throw redirect({ to: "/admin-login" });

    return { user: data.user };
  },
  component: PlatformAdminLayout,
});

const nav = [
  { to: "/admin-customers", label: "Onboard customer", icon: Building2 },
  { to: "/admin-live-customers", label: "Live customers", icon: Users },
  { to: "/admin-offboarded-customers", label: "Offboarded customers", icon: UserX },
  { to: "/admin-support", label: "Support", icon: MessageCircle },
] as const;

function PlatformAdminLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Same notification pattern as the staff Inbox: a live badge count on
  // the nav item, plus a toast + sound when a new staff message comes in
  // on any support thread — needs_admin mirrors needs_staff exactly (see
  // the support_chat migration), so this is a straightforward reuse of
  // an already-established concept, not a new one.
  const { data: needsAdminCount, refetch: refetchSupportCount } = useQuery({
    queryKey: ["support-needs-admin-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("support_conversations")
        .select("id", { count: "exact", head: true })
        .eq("needs_admin", true);
      return count ?? 0;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("platform-admin-support")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages" },
        (payload) => {
          const row = payload.new as { sender?: string; body?: string };
          if (row.sender !== "staff") return;
          toast.info("New support message", { description: row.body ? row.body.slice(0, 80) : undefined });
          playNotificationSound();
          refetchSupportCount();
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "support_conversations" }, () => {
        refetchSupportCount();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetchSupportCount]);

  async function signOut() {
    sessionStorage.removeItem("admin_gate_token");
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/admin-login", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="h-12 flex items-center justify-between border-b border-border px-4 bg-card/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Shield className="h-4 w-4" />
            Serai admin
          </div>
          <nav className="flex items-center gap-1">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition ${
                  pathname === item.to ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <item.icon className={`h-3.5 w-3.5 ${pathname === item.to ? "text-brand" : ""}`} />
                {item.label}
                {item.to === "/admin-support" && !!needsAdminCount && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-medium text-destructive-foreground">
                    {needsAdminCount > 99 ? "99+" : needsAdminCount}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-1.5" /> Sign out
          </Button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
