import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function decodeBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

async function encryptionKey() {
  const raw = decodeBase64(requireEnv("ENGLAND_GOLF_CREDENTIAL_KEY"));
  if (raw.byteLength !== 32) throw new Error("ENGLAND_GOLF_CREDENTIAL_KEY must be 32 bytes base64");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
}

async function encryptPassword(password: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(password),
  );
  return {
    password_ciphertext: encodeBase64(new Uint8Array(cipher)),
    password_iv: encodeBase64(iv),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { userId, playerPin, username, password } = await req.json();
    if (!userId || !playerPin || !username || !password) {
      return json({ error: "Missing user, PIN, username or password" }, 400);
    }

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const { data: user, error: userError } = await supabase
      .from("cup_users")
      .select("id,pin,handicap")
      .eq("id", userId)
      .single();

    if (userError || !user || String(user.pin) !== String(playerPin)) {
      return json({ error: "Could not verify player account" }, 403);
    }

    const encrypted = await encryptPassword(String(password));
    const now = new Date().toISOString();

    const { error: upsertError } = await supabase
      .from("england_golf_credentials")
      .upsert({
        user_id: userId,
        username: String(username).trim(),
        ...encrypted,
        updated_at: now,
        last_sync_error: null,
      });

    if (upsertError) throw upsertError;

    const { error: updateError } = await supabase
      .from("cup_users")
      .update({
        england_golf_member_no: String(username).trim(),
        england_golf_sync_error: null,
      })
      .eq("id", userId);

    if (updateError) throw updateError;

    return json({
      ok: true,
      connected: true,
      handicap: user.handicap,
      synced_at: null,
      message: "England Golf credentials saved. Daily sync will update the handicap.",
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
