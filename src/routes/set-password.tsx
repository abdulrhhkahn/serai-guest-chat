import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/set-password")({
  ssr: false,
  component: SetPasswordPage,
});

/**
 * Where invite emails (staff and hotel-admin invites, see invite-staff.ts
 * and customers.ts's createHotel) AND password-reset emails (see auth.tsx's
 * "Forgot password?") both redirect to. Both flows work identically from
 * this page's point of view: Supabase verifies the token on its own server
 * first, then redirects back here with a valid session already attached in
 * the URL — the browser's Supabase client picks that up automatically on
 * load. What neither flow does on its own is set a password; without this
 * page, the person is logged in for this one session only and can never
 * sign in again normally. This page is what actually sets one.
 */
function SetPasswordPage() {
  const navigate = useNavigate();
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // The session from the invite link's hash-fragment tokens is picked
    // up asynchronously by the client — give it a moment, then check.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
      setCheckingSession(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setHasSession(true);
        setCheckingSession(false);
      }
    });
    const timeout = setTimeout(() => setCheckingSession(false), 3000);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters.");
    if (password !== confirmPassword) return toast.error("Passwords don't match.");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Password set — welcome to Serai.");
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
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Set your password</CardTitle>
            <CardDescription>One last step before you get to your dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            {checkingSession ? (
              <p className="text-sm text-muted-foreground">Checking your invite link…</p>
            ) : !hasSession ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  This invite link looks expired or already used. Ask whoever invited you to send a new one, or sign in below if you've already set a password.
                </p>
                <Button variant="outline" className="w-full" onClick={() => navigate({ to: "/auth" })}>
                  Go to sign in
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <PasswordInput
                    id="password"
                    required
                    autoFocus
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">At least 8 characters.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <PasswordInput
                    id="confirm-password"
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? "Saving…" : "Set password & continue"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
