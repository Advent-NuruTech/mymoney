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

