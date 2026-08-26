import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setRememberMePreference } from "@/integrations/supabase/remember-me-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [rememberMe, setRememberMe] = useState(true);
  const [resetting, setResetting] = useState(false);
  // Reused from the guest chat — renders nothing unless VITE_TURNSTILE_SITE_KEY
  // is set. Also enable CAPTCHA protection in Supabase's own dashboard
  // (Authentication → Attack Protection) with the matching secret — passing
  // the token here alone does nothing unless Supabase is told to check it.
  const [captchaToken, setCaptchaToken] = useState("");

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Must be set before signInWithPassword — that call is what actually
    // writes the session, and the storage adapter reads this preference
    // at that moment to decide where it goes.
    setRememberMePreference(rememberMe);
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

  async function forgotPassword() {
    if (!email.trim()) return toast.error("Enter your email above first, then click \"Forgot password?\"");
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/set-password`,
    });
    setResetting(false);
    // Same generic message regardless of outcome — doesn't confirm
    // whether that email has an account.
    toast.success("If that email has an account, a reset link is on its way.");
    if (error) console.error(error);
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={forgotPassword}
                    disabled={resetting}
                    className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-50"
                  >
                    {resetting ? "Sending…" : "Forgot password?"}
                  </button>
                </div>
                <PasswordInput
                  id="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="remember-me" checked={rememberMe} onCheckedChange={(v) => setRememberMe(v === true)} />
                <Label htmlFor="remember-me" className="text-sm font-normal cursor-pointer">
                  Remember me
                </Label>
              </div>
              <GuestTurnstile onToken={setCaptchaToken} />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
