import { createFileRoute, Outlet, redirect, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";
import { LayoutDashboard, ClipboardList, Inbox, BookOpen, Settings, LogOut, Plus, Check, BarChart3, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    // Guests hold an anonymous session (is_anonymous=true); they must never
    // reach the staff area even though they are technically "authenticated".
    if (error || !data.user || data.user.is_anonymous) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/checkins", label: "Check-ins", icon: ClipboardList },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/knowledge", label: "Knowledge base", icon: BookOpen },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || `hotel-${Date.now()}`;
}

function AuthedLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      return (data ?? []).some((r) => r.role === "admin");
    },
  });

  const { data: isOrgAdmin } = useQuery({
    queryKey: ["is-org-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase.from("org_admins").select("org_id").eq("user_id", u.user.id).limit(1);
      return (data ?? []).length > 0;
    },
  });

  const { data: property } = useQuery({
    queryKey: ["current-property"],
    queryFn: async () => {
      const { data: prof } = await supabase.from("staff_profiles").select("property_id, full_name").maybeSingle();
      if (!prof?.property_id) return null;
      const { data: p } = await supabase.from("properties").select("*").eq("id", prof.property_id).maybeSingle();
      return p;
    },
  });

  const { data: properties } = useQuery({
    queryKey: ["all-properties", isAdmin],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("id,name,slug,brand_color").order("name");
      return data ?? [];
    },
  });

  async function switchTo(propertyId: string) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("staff_profiles").update({ property_id: propertyId }).eq("id", u.user.id);
    if (error) return toast.error(error.message);
    toast.success("Switched property");
    await qc.invalidateQueries();
  }

  async function createProperty() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const slug = slugify(newName);
      const { data, error } = await supabase.from("properties").insert({ name: newName.trim(), slug }).select("id").single();
      if (error) throw error;
      await switchTo(data.id);
      setCreating(false);
      setNewName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b border-sidebar-border">
            {isAdmin && properties && properties.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex w-full items-center gap-2 px-2 py-2 hover:bg-sidebar-accent rounded-md transition text-left">
                    <div className="h-7 w-7 rounded-md flex-shrink-0" style={{ background: property?.brand_color ?? "#0b6b75" }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-serif">{property?.name ?? "Serai"}</div>
                      <div className="truncate text-[11px] text-muted-foreground">Switch property ▾</div>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel>Your properties</DropdownMenuLabel>
                  {properties.map((p) => (
                    <DropdownMenuItem key={p.id} onClick={() => switchTo(p.id)}>
                      <div className="h-4 w-4 rounded flex-shrink-0" style={{ background: p.brand_color ?? "#0b6b75" }} />
                      <span className="flex-1 truncate">{p.name}</span>
                      {p.id === property?.id && <Check className="h-3.5 w-3.5" />}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setCreating(true)}>
                    <Plus className="h-4 w-4" /> New property
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-2 px-2 py-2">
                <div className="h-7 w-7 rounded-md" style={{ background: property?.brand_color ?? "#0b6b75" }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-serif">{property?.name ?? "Serai"}</div>
                  <div className="truncate text-[11px] text-muted-foreground">Staff dashboard</div>
                </div>
              </div>
            )}
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {nav.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={pathname === item.to}>
                        <Link to={item.to} className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  {isOrgAdmin && (
                    <SidebarMenuItem key="/organization">
                      <SidebarMenuButton asChild isActive={pathname === "/organization"}>
                        <Link to={"/organization" as "/settings"} className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          <span>Organisation</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <Button variant="ghost" size="sm" onClick={signOut} className="justify-start">
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </SidebarFooter>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center gap-2 border-b border-border px-3 bg-card/50">
            <SidebarTrigger />
            <div className="text-sm text-muted-foreground capitalize">
              {pathname.replace("/", "") || "dashboard"}
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New property</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-prop-name">Property name</Label>
            <Input id="new-prop-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Casa del Mar" autoFocus />
            <p className="text-xs text-muted-foreground">A guest link will be generated at /checkin/{slugify(newName || "your-hotel")}.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={createProperty} disabled={!newName.trim() || saving}>{saving ? "Creating…" : "Create & switch"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
