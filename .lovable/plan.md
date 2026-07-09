## Serai — Guest Services & Mobile Check-In Platform

A mobile-first PWA with two surfaces in one codebase: a public no-login guest experience and a Supabase-auth-protected staff dashboard. Built on the existing TanStack Start + React + TS + Tailwind + shadcn stack, with Lovable Cloud (Supabase) for auth, Postgres, storage, and edge/server functions.

### Tech mapping to this stack
- Routing: TanStack Start file-based routes (not React Router). Guest routes are top-level/public; staff routes live under `src/routes/_authenticated/`.
- Backend: Lovable Cloud (Supabase). App-internal logic uses `createServerFn`; AI concierge uses a server route. No Supabase Edge Functions.
- PWA: manifest + icons only (installable / Add to Home Screen). No offline service worker unless you ask for it.
- UI: shadcn/ui + Tailwind v4 tokens. Warm hospitality feel for guest, Linear/Vercel-clean for staff.

### Build order (matches your spec)

**1. Enable Lovable Cloud + schema**
- Tables: `properties`, `staff_profiles`, `checkins`, `conversations`, `messages`, `faqs`, plus `app_role` enum + `user_roles` table + `has_role()` (roles never live on profile tables).
- RLS: staff scoped to their `property_id` via a `staff_property_id()` security-definer helper; anon INSERT on `checkins`/`conversations`/`messages` (validated against a real `property_id`); anon SELECT on `properties` and `faqs`.
- Storage buckets: `guest-ids` (private, staff-read via signed URLs), `guest-signatures` (private), `property-logos` (public).
- Seed: "Serai Demo Hotel" (slug `demo`, teal brand) + 4 sample FAQs.

**2. Staff auth + shell + Settings**
- `/auth` email+password (Lovable Cloud managed). Signup creates a `staff_profiles` row linked to the demo property (single-tenant onboarding for now).
- `_authenticated/` layout with sidebar: Dashboard, Check-Ins, Inbox, Knowledge, Settings.
- Settings page: edit property fields, upload logo, pick brand color, view guest link + generated QR code for `/checkin/{slug}`.

**3. Guest check-in wizard** — `/checkin/$slug`
5 steps with progress bar: Welcome → Details → ID upload (optional, to storage) → Signature pad + terms → Done (shows wifi, times, "Chat with us" CTA). Writes one `checkins` row with `status='pending'`.

**4. Staff Check-Ins**
`/checkins` table with status filter, row → detail drawer with all fields, ID image (signed URL), signature image, and Verify / Complete actions.

**5. Guest hub + chat, Staff inbox (real-time)**
- `/stay/$slug` with Info / Guidebook / Chat tabs.
- Chat: creates/reuses a `conversation`, inserts guest `message`, calls AI server route. **AI-stubbed fallback**: if `LOVABLE_API_KEY` is unset or the call fails, insert "A team member will reply shortly." and leave conversation open.
- `/inbox`: two-column inbox with Supabase realtime subscription. Composer shows an "AI suggested reply" drafted from the property's FAQs — Approve & Send / Edit / dismiss.

**6. Knowledge Base** — `/knowledge` CRUD for `faqs`.

**7. Wire AI last** — Lovable AI Gateway via server route for both guest concierge and staff suggested replies. Grounded on that property's FAQs. Graceful fallback preserved.

### Design system
- Guest: warm hospitality — soft cream background, teal brand accent (driven by `property.brand_color` as a CSS var so each property re-skins), generous spacing, large touch targets, rounded cards, serif display font for headings + clean sans for body.
- Staff: neutral zinc surfaces, subtle borders, dense but readable tables, muted KPI cards.
- All colors as semantic tokens in `src/styles.css` (oklch). No hardcoded hex in components.

### Technical notes
- Guest routes are top-level and SSR-on so QR-scanned links render fast and are shareable.
- Staff routes under `_authenticated/` use the integration-managed gate.
- `staff_profiles` created via a `handle_new_user()` trigger on signup (defaults to demo property; changeable in Settings).
- Signature pad: lightweight canvas component, exported as PNG to storage.
- QR code: `qrcode` npm package rendered client-side in Settings.
- PWA: `public/manifest.webmanifest` + head tags + generated icon. No service worker.

### Out of scope for v1 (say the word to add)
- Multi-property onboarding UI (signup auto-attaches to demo; swap in Settings).
- Guidebook CRUD (static list in v1, editable table can come next).
- SMS/WhatsApp channels (schema supports `channel` but only `web` wired).
- Payments, room assignments, housekeeping.

Ready to build in this order — confirm and I'll start with enabling Cloud and the schema.