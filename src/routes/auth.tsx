import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { GuestTurnstile } from "@/components/GuestTurnstile";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

// Signup is invite-only now (Settings → Staff sends a real Supabase invite
// tied to a specific property). This page is sign-in only — self-serve
// account creation is disabled at the source in Supabase's dashboard
// (Authentication → Sign In / Providers → "Allow new users to sign up").
function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // Reused from the guest chat — renders nothing unless VITE_TURNSTILE_SITE_KEY
  // is set. Also enable CAPTCHA protection in Supabase's own dashboard
  // (Authentication → Attack Protection) with the matching secret — passing
  // the token here alone does nothing unless Supabase is told to check it.
  const [captchaToken, setCaptchaToken] = useState("");

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    setLoading(false);
    setCaptchaToken("");
    // Generic message regardless of whether the email exists or the
    // password was wrong — avoids confirming which accounts exist.
    if (error) return toast.error("Invalid email or password.");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg" style={{ background: "#0b6b75" }} />
            <span className="font-serif text-2xl">Serai</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Staff dashboard</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>Sign in to manage guests and messages.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={signIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <GuestTurnstile onToken={setCaptchaToken} />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              New staff are invited by their hotel's admin — no self-signup.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
