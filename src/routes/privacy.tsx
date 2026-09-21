import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Serai" },
      { name: "description", content: "How Serai collects, uses, and protects data." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-12 text-sm leading-relaxed text-foreground">
        <h1 className="font-serif text-3xl mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated September 2026</p>

        <p className="mb-6">
          Serai ("we," "us") provides guest messaging, mobile check-in, and related tools for hotels and
          short-term rental properties. This page explains what data we collect, how it's used, and how it's
          protected — for both hotel staff who use the Serai dashboard and guests who use Serai's guest-facing
          check-in, chat, menu, and activities pages.
        </p>

        <h2 className="font-serif text-xl mt-8 mb-3">Data we collect</h2>
        <p className="mb-2"><strong>From guests:</strong></p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>Name, arrival/departure dates, and other check-in details entered at check-in</li>
          <li>A photo of a government ID, driver's license, or passport, where check-in requests one</li>
          <li>A digital signature captured during check-in</li>
          <li>Messages sent through the guest chat, menu, or activities pages</li>
        </ul>
        <p className="mb-2"><strong>From hotel staff:</strong></p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>Name and email address, used for account access</li>
          <li>Actions taken in the dashboard (replies sent, conversations resolved), kept as an activity log
            for the property's own admin</li>
        </ul>

        <h2 className="font-serif text-xl mt-8 mb-3">How we use this data</h2>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li>To run the check-in process and guest messaging a property has set up</li>
          <li>To verify that an uploaded check-in document is a genuine ID, license, or passport, using an
            AI image-classification service — this only classifies document type and is instructed never to
            record any name, number, or other detail from the document itself</li>
          <li>To let an AI concierge suggest, draft, or (where a property has enabled it) send replies to
            routine guest questions</li>
          <li>To send booking confirmations and related emails</li>
          <li>To schedule demo calls, where a Google Calendar/Meet link is requested</li>
        </ul>

        <h2 className="font-serif text-xl mt-8 mb-3">Data retention</h2>
        <p className="mb-4">
          Uploaded ID documents are automatically deleted from storage after a guest's stay concludes, on an
          automated schedule — they are not kept indefinitely. Other check-in and conversation records are
          retained by the property for their own operational and record-keeping purposes.
        </p>

        <h2 className="font-serif text-xl mt-8 mb-3">Third-party services</h2>
        <p className="mb-2">Serai relies on the following services to operate:</p>
        <ul className="list-disc pl-6 mb-4 space-y-1">
          <li><strong>Supabase</strong> — database, authentication, and file storage</li>
          <li><strong>Google (Calendar API)</strong> — creates Google Meet links for scheduled demo calls,
            only when a property or prospective customer books one</li>
          <li><strong>Resend</strong> — delivers transactional emails (confirmations, invites, password resets)</li>
          <li>An AI provider — powers the guest concierge's suggested replies and the ID-document type check
            described above</li>
        </ul>
        <p className="mb-4">
          Each of these processes only the data necessary for the function described. We do not sell guest or
          staff data, and we do not use it for advertising.
        </p>

        <h2 className="font-serif text-xl mt-8 mb-3">Your choices</h2>
        <p className="mb-4">
          Guests are not required to create an account to use Serai's chat, menu, or activities pages. Where a
          property requests an ID photo at check-in, this is used solely to verify identity for that stay.
          Hotel staff accounts are created by invitation from their property's admin.
        </p>

        <h2 className="font-serif text-xl mt-8 mb-3">Contact</h2>
        <p>
          Questions about this policy or your data can be sent to{" "}
          <a href="mailto:demos@info.saraios.com" className="underline">demos@info.saraios.com</a>.
        </p>
      </div>
    </div>
  );
}
