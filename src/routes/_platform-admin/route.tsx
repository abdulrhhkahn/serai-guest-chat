import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Building2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Separate pathless layout from _authenticated — deliberately does NOT
 * reuse that layout's hotel sidebar (property switcher, guest-ops nav).
 * This is Abdul's own internal tool, not something a hotel admin should
 * ever see the chrome of. Gated to the site-wide `admin` role; anyone else
 * (including org admins) gets bounced to the regular dashboard.
 */
export const Route = createFileRoute("/_platform-admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user || data.user.is_anonymous) throw redirect({ to: "/auth" });

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) throw redirect({ to: "/dashboard" });

    return { user: data.user };
  },
  component: PlatformAdminLayout,
});

const nav = [
  { to: "/admin-customers", label: "Customers", icon: Building2 },
] as const;

function PlatformAdminLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
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
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            Exit to hotel view
          </Link>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-1.5" /> Sign out
          </Button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
