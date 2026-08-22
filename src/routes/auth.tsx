import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  // Reused from the guest chat — renders nothing unless VITE_TURNSTILE_SITE_KEY
  // is set, so this is a no-op until Turnstile is actually configured. Once
  // configured, also turn on CAPTCHA protection in Supabase's own dashboard
  // (Authentication → Attack Protection) with the matching secret key —
  // that's what actually verifies the token server-side; passing it here
  // alone does nothing unless Supabase is told to check it.
  const [signInToken, setSignInToken] = useState("");
  const [signUpToken, setSignUpToken] = useState("");

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: signInToken ? { captchaToken: signInToken } : undefined,
    });
    setLoading(false);
    setSignInToken("");
    // Generic message regardless of whether the email exists or the
    // password was wrong — avoids confirming which accounts exist.
    if (error) return toast.error("Invalid email or password.");
    navigate({ to: "/dashboard" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: name },
        ...(signUpToken ? { captchaToken: signUpToken } : {}),
      },
    });
    setLoading(false);
    setSignUpToken("");
    if (error) return toast.error(error.message);
    toast.success("Account created. You're signed in.");
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
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form onSubmit={signIn} className="space-y-4 pt-4">
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
                  <GuestTurnstile onToken={setSignInToken} />
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Signing in…" : "Sign in"}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={signUp} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full name</Label>
                    <Input id="name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email2">Email</Label>
                    <Input
                      id="email2"
                      type="email"
                      required
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password2">Password</Label>
                    <Input
                      id="password2"
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">At least 8 characters.</p>
                  </div>
                  <GuestTurnstile onToken={setSignUpToken} />
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Creating…" : "Create account"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    You'll be linked to the "Serai Demo Hotel" property. You can rename it and change branding in Settings.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
