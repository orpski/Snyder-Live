const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const LOGIN_URL = 'https://www.englandgolf.org/my-golf-login';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function decryptPassword(row) {
  const key = Buffer.from(requiredEnv('ENGLAND_GOLF_CREDENTIAL_KEY'), 'base64');
  if (key.length !== 32) throw new Error('ENGLAND_GOLF_CREDENTIAL_KEY must be 32 bytes base64');
  const iv = Buffer.from(row.password_iv, 'base64');
  const encrypted = Buffer.from(row.password_ciphertext, 'base64');
  const tag = encrypted.subarray(encrypted.length - 16);
  const body = encrypted.subarray(0, encrypted.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

async function fillFirst(page, selectors, value) {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if (await loc.count()) {
      await loc.fill(value);
      return true;
    }
  }
  return false;
}

async function clickFirst(page, selectors) {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if (await loc.count()) {
      await loc.click();
      return true;
    }
  }
  return false;
}

function handicapFromText(text) {
  const patterns = [
    /My\s+Handicap\s+Index(?:®|\(R\))?\s*([0-9]+(?:\.[0-9])?)/i,
    /Handicap\s+Index(?:®|\(R\))?[^0-9+-]*([+-]?[0-9]+(?:\.[0-9])?)/i,
    /Low\s+Index\s*:\s*[0-9.]+[\s\S]{0,120}?([0-9]+(?:\.[0-9])?)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);
      if (Number.isFinite(value) && value >= -10 && value <= 54) return value;
    }
  }
  return null;
}

async function fetchHandicap(browser, username, password) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  try {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await fillFirst(page, [
      'input[name="username"]',
      'input[name="email"]',
      'input[type="email"]',
      'input[type="text"]',
      'input[autocomplete="username"]',
    ], username);
    await fillFirst(page, [
      'input[name="password"]',
      'input[type="password"]',
      'input[autocomplete="current-password"]',
    ], password);
    await clickFirst(page, [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Login")',
      'button:has-text("Log in")',
      'text=Login',
      'text=Log in',
    ]);
    await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const text = await page.locator('body').innerText({ timeout: 15000 });
    const handicap = handicapFromText(text);
    if (handicap === null) throw new Error('Could not find Handicap Index after login');
    return handicap;
  } finally {
    await page.close().catch(() => {});
  }
}

async function updateSyncError(supabase, userId, error) {
  const message = String(error && error.message || error).slice(0, 250);
  await supabase.from('england_golf_credentials').update({
    last_sync_at: new Date().toISOString(),
    last_sync_error: message,
  }).eq('user_id', userId);
  await supabase.from('cup_users').update({
    england_golf_last_sync_at: new Date().toISOString(),
    england_golf_sync_error: message,
  }).eq('id', userId);
}

async function main() {
  const supabase = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
  const { data: rows, error } = await supabase
    .from('england_golf_credentials')
    .select('user_id,username,password_ciphertext,password_iv,cup_users(display_name,username,handicap)');
  if (error) throw error;
  if (!rows || !rows.length) {
    console.log('No England Golf credentials connected.');
    return;
  }

  const browser = await chromium.launch({ headless: true });
  try {
    for (const row of rows) {
      const playerName = (row.cup_users && (row.cup_users.display_name || row.cup_users.username)) || row.username;
      const playerLabel = `${playerName} (${row.username})`;
      try {
        const oldHandicap = parseFloat(row.cup_users && row.cup_users.handicap);
        const password = decryptPassword(row);
        const newHandicap = await fetchHandicap(browser, row.username, password);
        const now = new Date().toISOString();

        await supabase.from('cup_users').update({
          handicap: newHandicap,
          england_golf_member_no: row.username,
          england_golf_last_sync_at: now,
          england_golf_sync_error: null,
        }).eq('id', row.user_id);

        await supabase.from('england_golf_credentials').update({
          last_sync_at: now,
          last_sync_error: null,
        }).eq('user_id', row.user_id);

        if (!Number.isFinite(oldHandicap) || oldHandicap !== newHandicap) {
          await supabase.from('handicap_sync_history').insert({
            user_id: row.user_id,
            old_handicap: Number.isFinite(oldHandicap) ? oldHandicap : null,
            new_handicap: newHandicap,
          });
        }
        console.log(`Updated ${playerLabel}: ${Number.isFinite(oldHandicap) ? oldHandicap : 'n/a'} -> ${newHandicap}`);
      } catch (entryError) {
        await updateSyncError(supabase, row.user_id, entryError);
        console.error(`Failed ${playerLabel}: ${entryError.message || entryError}`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
