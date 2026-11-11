# Project decisions

## Brand identity

- The official My Money logo is `public/logo.jpeg`. Preserve its distinctive green rounded square and bright lime/yellow star; do not replace it with a generic symbol or change its proportions.
- `public/logo.png` is the tightly cropped, transparent-background version used in the app. The derived `public/icon-*.png` files provide the favicon and installed-app icons.
- The logo defines the official color direction: deep green with vivid lime/yellow accents. The installed-app background and theme color are `#003b19`. Keep future colors and visual decisions consistent with this identity, and avoid a white launch background.
- Keep the logo prominent and legible, while allowing appropriate padding for platform icon masks.

## Recording decisions

- Record consequential decisions and explicit user preferences in this file when they are made, updating existing guidance if a newer decision replaces it. Keep the notes concise and specific so future work can follow them without asking the user to repeat themselves.

- Keep the custom in-app account panel and Clerk-managed profile, security, and sessions compatible with the existing local-first offline cache and sync.
- Keep Settings and Sign out inside the profile account panel rather than in the header, including on mobile.

- Keep a dedicated, searchable and paginated activity page for large transaction histories, with recent activity on the overview.
