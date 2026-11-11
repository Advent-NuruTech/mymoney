# My Money

A simple installable money tracker. Entries are stored locally in IndexedDB first, so recording works offline after the first visit. Once a user signs in and reconnects, queued changes sync to the server and appear on their other signed-in devices.

## Run locally

Requires Node.js 22.9 or newer.

```sh
npm install
npm run dev
```

Open http://localhost:3000. The app works locally without Clerk, but entries stay on that device until sign-in is configured. Guest entries remain separate from signed-in entries.

For a production server, run `npm run build` followed by `npm start`. Run `npm test` after building to check the server endpoints.

## Enable accounts and sync

Create a local `.env` file or set the following environment variables before starting the server. Local environment files are excluded from Git:

- `CLERK_PUBLISHABLE_KEY`: the Clerk publishable key.
- `CLERK_DOMAIN`: the host in the Clerk Frontend API URL, without `https://` (for example `example.clerk.accounts.dev`). It must match the `iss` claim in Clerk session tokens.
- `NEXT_PUBLIC_SUPABASE_URL`: your Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: its publishable API key.
- `PORT` (optional): defaults to `3000`.

Configure your app's production domain in Clerk. Serve the app over HTTPS in production; service workers require HTTPS except on localhost. A user must open the app online at least once to cache it before offline use. An existing signed-in user's data remains available offline on the same device. Changes are sent on reconnect, when the app is open. Sign in on another device to retrieve synced data.

## Configure Supabase sync

1. Configure Clerk as a third-party authentication provider in Supabase and configure Clerk session tokens to contain the `authenticated` role. Follow the [Supabase Clerk integration guide](https://supabase.com/docs/guides/auth/third-party/clerk). The publishable key by itself does not authenticate a user.
2. Apply `supabase/migrations/202611090001_sync.sql` in your project's SQL Editor. The migration creates private tables and exposes only a user-authenticated sync function. Keep the database and Clerk secrets out of client code.
3. Restart the app, sign in, and check that a transaction appears on another signed-in device. Configure Supabase backups and test restoration before relying on it for important data.

Sync uses server-issued versions, per-user cursors, idempotent operations, and retained deletion records. Concurrent edits show a choice between the local and server versions. IndexedDB records created by the old app are uploaded when their owner next signs in. The old `.data/transactions.json` is **not** automatically imported; keep a backup and migrate any server-only records before retiring the old server. Guest entries remain on their original device.

The sync history and idempotency records are currently retained indefinitely. This avoids losing changes for long-offline devices but requires storage monitoring and a future retention/full-resync policy as usage grows. Offline data stored only on a device can be lost if browser storage is cleared. Amounts are currently displayed in USD.



## Multi-account ledger

Apply `supabase/migrations/202611110001_multi_account.sql` **after** the original sync migration and **before** releasing the new client. It extends the existing per-user, versioned, idempotent RPC to retain account, transfer, category, reconciliation and audit records. No existing financial records are rewritten. This migration has not been applied automatically.

Existing transactions appear under **Unassigned** until the user assigns an account. Opening balances precede recorded history; archived accounts stay in the combined total. A transfer is one atomic IndexedDB record. Its fee appears as a linked Transaction Charges expense row, with exactly one deduction from the source. Reconciliation confirmations preserve their calculated and actual balances; explicit adjustments never count as earnings or spending. Edit and deletion snapshots are retained as separate audit records.

Message import runs entirely offline with review before saving. Paste paragraphs or upload a text file / JSON array (strings or objects with `body`, `message`, or `text`). Common M-PESA, Airtel and bank wording is recognized; unsupported wording must be entered manually. Missing dates and ambiguous accounts require selection. No fee schedule is assumed. Messages on both sides of an existing transfer are suggested for explicit linking; conflicting fees require correcting the parent transfer first. A share target is registered for browsers supporting installed PWA sharing; paste/file import remains available elsewhere. There is no SMS inbox permission.

Use a single chosen currency for all accounts; changing the existing currency preference changes labels, not values. Reports support account, category, group, date range and daily/weekly/monthly/yearly periods. Review reminders appear in-app and do not request notification permission.

Validation: `node --experimental-strip-types --test tests/*.test.js`, `npm run build`, then `node --experimental-strip-types --test server.test.js`. Real browser offline/share-target and two-device sync acceptance checks remain necessary before production release.
