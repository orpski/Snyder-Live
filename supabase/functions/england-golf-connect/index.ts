import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LOGIN_URL = "https://www.englandgolf.org/my-golf-login";

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

function collectSetCookies(headers: Headers) {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const values = typeof getSetCookie === "function" ? getSetCookie.call(headers) : [headers.get("set-cookie") || ""];
  return values
    .filter(Boolean)
    .map((value) => value.split(";")[0])
    .filter(Boolean);
}

function mergeCookies(existing: string[], headers: Headers) {
  const byName = new Map(existing.map((cookie) => [cookie.split("=")[0], cookie]));
  collectSetCookies(headers).forEach((cookie) => byName.set(cookie.split("=")[0], cookie));
  return Array.from(byName.values());
}

function absoluteUrl(value: string) {
  return new URL(value, LOGIN_URL).toString();
}

async function fetchWithCookies(url: string, init: RequestInit = {}, cookies: string[] = [], redirects = 0): Promise<{ response: Response; text: string; cookies: string[]; url: string }> {
  const headers = new Headers(init.headers || {});
  if (cookies.length) headers.set("cookie", cookies.join("; "));
  const response = await fetch(url, { ...init, headers, redirect: "manual" });
  const nextCookies = mergeCookies(cookies, response.headers);
  const location = response.headers.get("location");
  if (location && response.status >= 300 && response.status < 400 && redirects < 5) {
    return fetchWithCookies(absoluteUrl(location), { method: "GET" }, nextCookies, redirects + 1);
  }
  return { response, text: await response.text(), cookies: nextCookies, url };
}

function hiddenFields(html: string) {
  const fields = new URLSearchParams();
  const inputPattern = /<input\b[^>]*>/gi;
  const attrPattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*["']([^"']*)["']/g;
  for (const input of html.match(inputPattern) || []) {
    const attrs: Record<string, string> = {};
    for (const match of input.matchAll(attrPattern)) attrs[match[1].toLowerCase()] = match[2];
    if ((attrs.type || "").toLowerCase() !== "hidden" || !attrs.name) continue;
    fields.set(attrs.name, attrs.value || "");
  }
  return fields;
}

function loginFailureMessage(text: string) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  if (/invalid|incorrect|not recognised|not recognized|unable to log|try again|failed/i.test(cleanText)) {
    return "England Golf says that username/member number or password is incorrect. Please re-enter them.";
  }
  if (/membership number/i.test(cleanText) && /password/i.test(cleanText) && /login|log in/i.test(cleanText)) {
    return "Could not verify those England Golf details with the quick check. Your existing saved login has not been changed.";
  }
  return "Could not verify those England Golf details with the quick check. Your existing saved login has not been changed.";
}

async function verifyEnglandGolfLogin(username: string, password: string) {
  const first = await fetchWithCookies(LOGIN_URL, { method: "GET" });
  const form = hiddenFields(first.text);
  form.set("ctl74$tbMembershipNumber", username.trim());
  form.set("ctl74$tbPassword", password);
  form.set("ctl74$btnLogin", "Login");

  const posted = await fetchWithCookies(
    "https://www.englandgolf.org/layouts/terraces_eg/Template.aspx?page=My+Golf+Login",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "referer": LOGIN_URL,
        "user-agent": "SnyderGolf/1.0",
      },
      body: form.toString(),
    },
    first.cookies,
  );

  const text = posted.text;
  const stillLogin = /ctl74_tbMembershipNumber|ctl74_tbPassword|Membership Number/i.test(text) && /Forgot Password|Login/i.test(text);
  const accepted = /Log out|My Overview|My Scores|My Handicap|Handicap Index/i.test(text) && !stillLogin;
  if (!accepted) return { ok: false, error: loginFailureMessage(text) };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { userId, playerPin, username, password, saveWithoutVerification } = await req.json();
    if (!userId || !playerPin || !username || !password) {
      return json({ error: "Missing user, PIN, username or password" }, 400);
    }

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SERVICE_ROLE_KEY"),
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

    if (!saveWithoutVerification) {
      const loginCheck = await verifyEnglandGolfLogin(String(username), String(password));
      if (!loginCheck.ok) {
        return json({
          error: loginCheck.error,
          canSaveAnyway: true,
          message: "Your existing saved England Golf login has not been changed.",
        }, 400);
      }
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
        england_golf_sync_error: saveWithoutVerification ? "Saved new login details. Waiting for next sync to confirm." : null,
      })
      .eq("id", userId);

    if (updateError) throw updateError;

    return json({
      ok: true,
      connected: true,
      handicap: user.handicap,
      synced_at: null,
      needs_sync_confirmation: !!saveWithoutVerification,
      message: saveWithoutVerification
        ? "England Golf credentials saved. Run the handicap sync to confirm them."
        : "England Golf username and password verified. Daily sync will update the handicap.",
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
