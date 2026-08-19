/**
 * RLS / security integration tests — the guarantees the patch series depends on.
 *
 * These need a running Supabase with all migrations applied. They SKIP unless
 * you set the env below (so `npm test` still runs the unit tests everywhere):
 *
 *   TEST_SUPABASE_URL=http://127.0.0.1:54321
 *   TEST_SUPABASE_ANON_KEY=<anon/publishable key>
 *   TEST_SUPABASE_SERVICE_KEY=<service role/secret key>
 *
 * Local stack:  supabase start  &&  supabase db reset   (applies migrations)
 * Then:         npm run test:integration
 *
 * Requires Anonymous sign-ins enabled (supabase/config.toml → [auth] enable_anonymous_sign_ins = true).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.TEST_SUPABASE_URL;
const ANON = process.env.TEST_SUPABASE_ANON_KEY;
const SERVICE = process.env.TEST_SUPABASE_SERVICE_KEY;
const run = !!(URL && ANON && SERVICE);

const admin = () => createClient(URL!, SERVICE!, { auth: { persistSession: false } });
const anonClient = () => createClient(URL!, ANON!, { auth: { persistSession: false, autoRefreshToken: false } });

async function newProperty(name: string) {
  const slug = `test-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const { data, error } = await admin().from("properties").insert({ name, slug }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

async function newGuest() {
  const c = anonClient();
  const { error } = await c.auth.signInAnonymously();
  if (error) throw error;
  const { data } = await c.auth.getUser();
  return { client: c, uid: data.user!.id };
}

async function newStaff(propertyId: string, role: "admin" | "agent" = "agent") {
  const email = `staff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = "test-password-123";
  const a = admin();
  const { data: created, error } = await a.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const uid = created.user!.id;
  await a.from("staff_profiles").insert({ id: uid, property_id: propertyId, full_name: "Test Staff", role });
  const c = anonClient();
  await c.auth.signInWithPassword({ email, password });
  return { client: c, uid };
}

describe.skipIf(!run)("RLS security", () => {
  beforeAll(() => {
    if (!run) console.warn("[integration] skipped — set TEST_SUPABASE_URL/ANON/SERVICE to run");
  });

  it("a guest cannot read another guest's conversation or messages", async () => {
    const propertyId = await newProperty("iso");
    const a = await newGuest();
    const b = await newGuest();

    const { data: conv, error } = await a.client
      .from("conversations")
      .insert({ property_id: propertyId, guest_user_id: a.uid, status: "open" })
      .select("id").single();
    expect(error).toBeNull();
    await a.client.from("messages").insert({ conversation_id: conv!.id, sender: "guest", body: "secret", approved: false });

    // Owner sees it.
    const own = await a.client.from("conversations").select("id").eq("id", conv!.id);
    expect(own.data?.length).toBe(1);

    // Other guest sees nothing.
    const otherConv = await b.client.from("conversations").select("id").eq("id", conv!.id);
    expect(otherConv.data ?? []).toHaveLength(0);
    const otherMsg = await b.client.from("messages").select("id").eq("conversation_id", conv!.id);
    expect(otherMsg.data ?? []).toHaveLength(0);
  });

  it("a client with no session (anon role) cannot read conversations", async () => {
    const propertyId = await newProperty("anon");
    const a = await newGuest();
    const { data: conv } = await a.client
      .from("conversations").insert({ property_id: propertyId, guest_user_id: a.uid, status: "open" })
      .select("id").single();

    const noSession = anonClient(); // never signs in
    const res = await noSession.from("conversations").select("id").eq("id", conv!.id);
    expect(res.data ?? []).toHaveLength(0);
  });

  it("a non-admin staff member cannot reassign their own property_id (tenant hop)", async () => {
    const prop1 = await newProperty("home");
    const prop2 = await newProperty("target");
    const staff = await newStaff(prop1, "agent");

    const { error } = await staff.client
      .from("staff_profiles").update({ property_id: prop2 }).eq("id", staff.uid);
    expect(error).not.toBeNull(); // trigger raises
  });

  it("staff only see their own property's conversations", async () => {
    const prop1 = await newProperty("p1");
    const prop2 = await newProperty("p2");
    const staff1 = await newStaff(prop1);
    const guest = await newGuest();

    // A conversation in prop2.
    const { data: conv } = await guest.client
      .from("conversations").insert({ property_id: prop2, guest_user_id: guest.uid, status: "open" })
      .select("id").single();

    const seen = await staff1.client.from("conversations").select("id").eq("id", conv!.id);
    expect(seen.data ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// DB-enforced guarantees added in v3–v8 (rate limits, staff-only tables,
// idempotency). Same gate: these run only against a real Supabase.
// ---------------------------------------------------------------------------
describe.skipIf(!run)("DB-enforced guarantees (v3–v8)", () => {
  it("staff-only tables are invisible to guests and to other properties' staff", async () => {
    const propA = await newProperty("a");
    const propB = await newProperty("b");
    const staffA = await newStaff(propA);
    const guest = await newGuest();

    // Seed a row in each staff-only table for property B (service role bypasses RLS).
    const a = admin();
    const { data: convB } = await a.from("conversations")
      .insert({ property_id: propB, status: "open" }).select("id").single();
    await a.from("ai_decisions").insert({ property_id: propB, conversation_id: convB!.id, channel: "web", category: "Wifi", level: "auto", outcome: "auto" });
    await a.from("category_autonomy").insert({ property_id: propB, category: "Billing", level: "approve" });
    await a.from("messaging_numbers").insert({ property_id: propB, channel: "sms", phone_number: `+1999${Date.now() % 10000000}` });
    await a.from("ai_drafts").insert({ conversation_id: convB!.id, property_id: propB, category: "Billing", draft: "secret draft" });

    for (const table of ["ai_decisions", "category_autonomy", "messaging_numbers", "ai_drafts"]) {
      const asStaffA = await staffA.client.from(table).select("id").eq("property_id", propB);
      expect(asStaffA.data ?? [], `${table} leaked to other property's staff`).toHaveLength(0);
      const asGuest = await guest.client.from(table).select("id").eq("property_id", propB);
      expect(asGuest.data ?? [], `${table} leaked to a guest`).toHaveLength(0);
    }

    // ...and staff A CAN see their own property's rules.
    await a.from("category_autonomy").insert({ property_id: propA, category: "Wifi", level: "auto" });
    const own = await staffA.client.from("category_autonomy").select("id").eq("property_id", propA);
    expect((own.data ?? []).length).toBeGreaterThan(0);
  });

  it("check_rate_limit allows up to the max, then blocks", async () => {
    const id = `test-${Date.now()}-${Math.random()}`;
    const a = admin();
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const { data } = await a.rpc("check_rate_limit", { _bucket: "test", _identity: id, _max: 3, _window_secs: 3600 });
      results.push(data as boolean);
    }
    expect(results).toEqual([true, true, true, false]);
  });

  it("the conversation-create trigger throttles an anonymous guest", async () => {
    const propertyId = await newProperty("rl");
    const guest = await newGuest();
    let blockedAt = -1;
    for (let i = 0; i < 12; i++) {
      const { error } = await guest.client.from("conversations")
        .insert({ property_id: propertyId, guest_user_id: guest.uid, status: "open" }).select("id").single();
      if (error) { blockedAt = i; break; }
    }
    // Default limit is 10/hour, so the 11th (index 10) should be the first to fail.
    expect(blockedAt).toBeGreaterThan(0);
    expect(blockedAt).toBeLessThanOrEqual(10);
  });

  it("message external_id is unique (webhook idempotency)", async () => {
    const propertyId = await newProperty("idem");
    const a = admin();
    const { data: conv } = await a.from("conversations")
      .insert({ property_id: propertyId, status: "open" }).select("id").single();
    const sid = `SM-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const first = await a.from("messages").insert({ conversation_id: conv!.id, sender: "guest", body: "hi", approved: true, external_id: sid });
    expect(first.error).toBeNull();
    const dup = await a.from("messages").insert({ conversation_id: conv!.id, sender: "guest", body: "hi again", approved: true, external_id: sid });
    expect(dup.error, "duplicate external_id should be rejected").not.toBeNull();
  });
});
