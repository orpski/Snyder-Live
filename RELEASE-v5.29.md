# Snyder Golf 5.29

The 2026 regular season ends at the end of 16 September (Europe/London).
Approved scores after that date remain in Supabase but do not count toward league totals, best eight, round fees, high score or Player of the Month. September Player of the Month closes with the season. Actual payments, separate sweepstakes and snake penalties are unchanged.

## Admin results

Open League → Admin → Enter / correct playoff results (or League → Playoffs after logging in). Select both semi-final winners and save. Their names populate the final. Select the final winner and save to award 70% of the remaining prize pot to the champion and 30% to the other finalist. Select the wooden spoon recipient: this is the loser of the bottom-two playoff. No cash award is created for the wooden spoon. Changing either semi-final winner clears the final winner until reconfirmed.

Results use zero-amount `League playoffs 2026` audit events in the existing `payment_log` table. They do not modify payment balances or scores, are excluded from the financial activity list, and are loaded on each league refresh. The latest event contains the seed order and results. No schema migration is required. Saving uses the existing league admin controls and database permissions; it does not introduce a different authentication model. A newer saved revision blocks a stale editor from overwriting it without a refresh.

## Rollback

The exact 5.28 baseline is preserved on GitHub branch `rollback/v5.28`, commit `e4b373835e32ce776ee9f7c307d6a65a4c851cdb`.

Revert the 5.29 release commit on main with a new revert commit and push it to redeploy 5.28. This restores the original visible version, scripts and service worker. Do not force-reset main. The earlier worker has different content/cache name, so browsers will install it on update. Close/reopen or refresh the app and check its version.

No score or payment rollback is required. 5.28 ignores playoff audit events for its calculations (it may list zero-amount events in its activity log). Reapplying 5.29 restores access to any saved results. 5.28 will again include post-cutoff scores, as it did before this change.

## Checks

Run `node tests/league-season.test.cjs` for date boundaries, seeding, result corrections and prize allocation. Both JSX files were compiled with the app's Babel version. A separate mobile browser check uses a local copy of league data and simulated writes so no fake results reach Supabase.
