# Project decisions

## Brand identity

- The official My Money logo is `public/logo.jpeg`. Preserve its distinctive green rounded square and bright lime/yellow star; do not replace it with a generic symbol or change its proportions.
- `public/logo.png` is the tightly cropped, transparent-background version used in the app. The derived `public/icon-*.png` files provide the favicon and installed-app icons.
- The logo defines the official color direction: deep green with vivid lime/yellow accents. The installed-app background and theme color are `#003b19`. Keep future colors and visual decisions consistent with this identity, and avoid a white launch background.
- Keep the logo prominent and legible, while allowing appropriate padding for platform icon masks.

## Recording decisions

- Accept both `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (used in Coolify) and legacy `CLERK_PUBLISHABLE_KEY` at runtime in the public configuration endpoint. Expose only the publishable key and Clerk domain, never the secret key.

- Record consequential decisions and explicit user preferences in this file when they are made, updating existing guidance if a newer decision replaces it. Keep the notes concise and specific so future work can follow them without asking the user to repeat themselves.

- Keep the custom in-app account panel and Clerk-managed profile, security, and sessions compatible with the existing local-first offline cache and sync.
- Keep Settings and Sign out inside the profile account panel rather than in the header, including on mobile.

- Keep a dedicated, searchable and paginated activity page for large transaction histories, with recent activity on the overview.

- Money In, Money Out and Move Money are distinct ledger groups. Transfers are one atomic record with source, destination and confirmed fee; fees count once in expenses and source balance. Never assume cash fees.
- Preserve legacy records under Unassigned until explicitly assigned. Archived accounts remain in combined balances. Reconciliation never silently changes balances; explicit adjustments are excluded from income and spending.
- Message extraction and review run offline; no SMS inbox permissions. Account/category/reconciliation records use the existing versioned sync transport; apply the multi-account migration before deploying this client.

- Keep the current sync SQL migration self-contained for SQL Editor users: create missing private schema/tables idempotently before compiling the RPC, preserve existing rows, and apply setup plus function replacement atomically.

- Keep the homepage uncluttered: show each amount summary once, with account details collapsed and detailed reports on Activity. Do not show Add account or Paste a message shortcuts on the homepage; keep both inside the existing Add transaction flow, accessible from the bottom Add button. Adding an account must preserve the transaction draft. Account setup starts with name, type and starting balance; advanced controls stay secondary.
- Message import must make direct pasting obvious, with a clipboard button and manual-paste fallback, and require review before saving. Keep file import available.
- New transaction times are optional and default to the current local time, including when left blank. Preserve times extracted from messages and existing records; identify a missing message time as a current-time default during review.
