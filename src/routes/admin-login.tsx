import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Shield } from "lucide-react";

export const Route = createFileRoute("/admin-login")({
  ssr: false,
  beforeLoad: async () => {
    // If already signed in as a confirmed admin AND already holding a valid
    // passphrase gate, skip straight through — otherwise always land here
    // to re-enter both factors. Not linked from anywhere in the regular
    // staff UI — this is a separate, unadvertised entry point.
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.session.user.id);
      const isAdmin = (roles ?? []).some((r) => r.role === "admin");
      const hasGate = !!sessionStorage.getItem("admin_gate_token");
      if (isAdmin && hasGate) throw redirect({ to: "/admin-customers" });
    }
  },
  component: AdminLoginPage,
});

// Two independent factors, deliberately not sharing a code path with the
// regular staff /auth page:
//   1. A Supabase account that actually holds the site-wide `admin` role
//   2. A separate passphrase (PLATFORM_ADMIN_PASSPHRASE, server-only) that
//      isn't stored anywhere in the Supabase user database at all — so
//      knowing/leaking a staff account's credentials alone never grants
//      access to this surface.
function AdminLoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"credentials" | "passphrase">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      setLoading(false);
      return toast.error("Invalid email or password.");
    }

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.session.user.id);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    setLoading(false);

    if (!isAdmin) {
      await supabase.auth.signOut();
      return toast.error("This account doesn't have admin access.");
    }
    setStep("passphrase");
  }

  async function submitPassphrase(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/admin/verify-passphrase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase }),
    });
    setLoading(false);
    if (!res.ok) {
      setPassphrase("");
      return toast.error("Incorrect passphrase.");
    }
    // Cleared automatically when the tab closes — re-entered every new
    // session, never persisted to localStorage.
    sessionStorage.setItem("admin_gate_token", passphrase);
    navigate({ to: "/admin-customers" });
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2">
            <Shield className="h-6 w-6" />
            <span className="font-serif text-2xl">Serai admin</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Internal — customer management</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{step === "credentials" ? "Sign in" : "Verify"}</CardTitle>
            <CardDescription>
              {step === "credentials" ? "Admin account credentials." : "Enter the admin passphrase to continue."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === "credentials" ? (
              <form onSubmit={submitCredentials} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <PasswordInput id="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Checking…" : "Continue"}
                </Button>
              </form>
            ) : (
              <form onSubmit={submitPassphrase} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="passphrase">Passphrase</Label>
                  <PasswordInput
                    id="passphrase"
                    required
                    autoFocus
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Verifying…" : "Enter"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
