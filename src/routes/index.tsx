import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, MessageSquareText, ClipboardCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="guest-surface min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-brand" />
          <span className="font-serif text-xl">Serai</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/checkin/$slug" params={{ slug: "demo" }} className="text-sm text-muted-foreground hover:text-foreground">
            Try guest demo
          </Link>
          <Link to="/auth">
            <Button size="sm" className="btn-brand">Staff login</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-12 sm:pt-20">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3" /> For independent hotels & guesthouses
          </div>
          <h1 className="mt-6 font-serif text-5xl leading-[1.05] sm:text-6xl">
            Mobile check-in and a concierge that never sleeps.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Guests scan a QR code, check in from their phone, and chat with your team — no app
            download, no lobby queue. Staff get one clean inbox with AI-drafted replies to approve.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/checkin/$slug" params={{ slug: "demo" }}>
              <Button size="lg" className="btn-brand">
                Try the guest check-in <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="lg" variant="outline">Open staff dashboard</Button>
            </Link>
          </div>
        </div>

        <div className="mt-20 grid gap-6 sm:grid-cols-3">
          <Feature icon={<ClipboardCheck className="h-5 w-5" />} title="Zero-friction check-in"
            body="A 60-second mobile wizard: details, ID, signature. Done before they reach the front desk." />
          <Feature icon={<MessageSquareText className="h-5 w-5" />} title="AI concierge"
            body="Guests ask anything — wifi, breakfast, late checkout — and get instant answers grounded in your FAQ." />
          <Feature icon={<Sparkles className="h-5 w-5" />} title="Human-in-the-loop"
            body="Staff see AI-suggested replies. Approve, edit, or send their own. Always a human in charge." />
        </div>
      </main>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-brand-foreground">
        {icon}
      </div>
      <h3 className="mt-4 font-serif text-xl">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
