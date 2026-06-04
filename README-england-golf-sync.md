# England Golf Handicap Sync

This adds a secure player connection flow for daily England Golf handicap updates.

## Supabase SQL

Run:

```sql
-- See supabase/sql/england_golf_handicap_sync.sql
```

## Secrets

Create one 32-byte base64 encryption key:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

Add the same value as:

- Supabase Edge Function secret: `ENGLAND_GOLF_CREDENTIAL_KEY`
- GitHub Actions secret: `ENGLAND_GOLF_CREDENTIAL_KEY`

Also add GitHub Actions secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Deploy Function

Deploy the credential-save function:

```bash
supabase functions deploy england-golf-connect
supabase secrets set ENGLAND_GOLF_CREDENTIAL_KEY=...
supabase secrets set SERVICE_ROLE_KEY=...
```

The frontend never stores England Golf passwords. It sends them to `england-golf-connect`, which encrypts them before writing to Supabase.

## Daily Sync

`.github/workflows/england-golf-handicap-sync.yml` runs once per day and can also be triggered manually from GitHub Actions.

The job:

1. Decrypts each connected player's England Golf password.
2. Logs into England Golf using Playwright.
3. Reads the current Handicap Index.
4. Updates `cup_users.handicap`.
5. Writes a `handicap_sync_history` row when the value changes.
