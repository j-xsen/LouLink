# Features & Roadmap

## MVP (What to Build First)

The MVP is the minimum that makes LouLink useful to its first real users.

### Public Directory (Home Page)
- List of all verified Louisville users
- Each card shows: avatar, display name, category, short bio snippet
- Clicking a card goes to their profile page
- No auth required

### Public Profile Page (`/:username`)
- Display name, avatar, bio
- Ordered list of links (label + URL)
- No auth required

### Pre-auth Link Builder (`/create`)
- Any visitor can build their link page at `/create` before creating an account
- Draft is persisted to `localStorage` under the key `loulink_draft`
- On save, if no session exists, user is redirected to `/signup`
- After signup, the draft is submitted as the initial set of links

### Account Creation (`/signup`)
- Register with email + password (or complete profile if already signed in)
- Choose a username (URL slug — 3–30 chars, lowercase alphanumeric with `-` and `_`)
- Set a display name
- Draft links from `/create` are carried through automatically

### Link Management (`/create` for logged-in users)
- Add, edit, delete links
- Section headers (`kind: 'header'`) for grouping links visually
- Reorder via drag-and-drop (grip handle)
- Saving replaces all links in bulk (`PUT /api/me/links`) — no per-link patching

### Settings (`/settings`)
- **Profile picture** — upload/change avatar (JPEG, PNG, WebP, GIF; max 5 MB; stored in Cloudflare R2)
- **Display name** — editable in settings (max 100 chars); also inline-editable on the Dashboard
- **Bio** — short description, max 300 characters
- **Profile appearance** — full theme system (see Theme System section below)
- **Categories** — multi-select from 25 granular subcategory slugs grouped under 5 parent labels (see Category Hierarchy section below)
- **Directory visibility** — verified users only: checkbox to hide profile from the home page (`hide_from_directory`)
- **Username** — change with live availability check; 3–30 chars, lowercase alphanumeric + `-` and `_`

### Theme System

Profile appearance is controlled by the `accent_color` column, which stores a pipe-delimited string parsed by `parseAccentColor()` and built by `buildAccentColor()` in `src/react-app/types.ts`.

**Format:** `themeKeyOrHex|headerHex|mono|shape|cardColor|cardTextColor` — any trailing segment may be absent.

**6 preset themes:**

| Key | Label | Background |
|---|---|---|
| `ink` | Ink | `#f2efe8` |
| `bluegrass` | Bluegrass | `#8ecfaa` |
| `river` | River | `#8ab8e8` |
| `bourbon` | Bourbon | `#f5a030` |
| `midnight` | Midnight | `#0f1629` |
| `terminal` | Terminal | `#0a0e08` |

Alternatively, the first segment may be a custom hex color for a fully custom background.

**Per-component overrides:**
- `headerHex` — hex color for section header text
- `mono` — literal string `"mono"` to disable social media brand colors (monochrome icons)
- `shape` — avatar shape: `circle`, `1`, `5`, `6` (blob SVG clip paths)
- `cardColor` — hex override for link card background
- `cardTextColor` — hex override for card text; defaults to WCAG auto-contrast via `autoTextColor()` in `src/react-app/lib/color.ts`

Settings page includes a live preview. "Generate theme from photo" extracts the dominant color from the user's avatar via `extractDominantColor()` in `src/react-app/lib/color.ts`.

### Social Links

Users can attach up to 8 social media profile URLs displayed as icons in the profile page header.

Stored as `profiles.social_links` (jsonb). Allowed platforms: `YouTube`, `Instagram`, `Facebook`, `Twitter`, `Twitch`, `Spotify`, `Bandcamp`, `SoundCloud`.

Managed on the Create page (social section) via `PUT /api/me/social-links`. Icons render in brand color by default; the `mono` appearance toggle renders them in a single neutral color instead.

### Directory Visibility Toggle

Verified users can hide themselves from the home page directory without affecting their profile URL.

- Setting: `/settings` → Directory visibility (only shown when `profile.verified === true`)
- API: `PUT /api/me/directory-visibility` with `{ hide: boolean }`
- Server enforces `verified = true` — unverified users' `hide_from_directory` is ignored by the directory query.

### Admin Dashboard (`/admin`)

A minimal web UI for managing user verification and profiles.

- Accessible only on localhost (enforced by `window.location.hostname` check inside the component; no route guard)
- Secured by `ADMIN_KEY` bearer token (entered in a password field; cached in `sessionStorage`; can also be pre-loaded from `VITE_ADMIN_KEY` env var in dev)
- **Capabilities:** list all profiles ordered by creation date, toggle `verified` flag, edit categories (uses simplified 5-item parent labels: `music`, `visual-art`, `food`, `retail`, `community` — not the 25 granular subcategory slugs), delete a profile (cascades to links and analytics; the Neon auth user must be removed separately via the Neon Console)

### Category Hierarchy

Categories are stored as an array of granular subcategory slugs in `profiles.categories[]`. The frontend groups them under 5 parent labels:

| Parent label | Subcategory slugs |
|---|---|
| Artists | `musician`, `composer`, `painter`, `sculptor`, `photographer`, `illustrator`, `filmmaker`, `dancer`, `writer` |
| Businesses | `retail`, `thrift`, `restaurant`, `coffee-shop`, `bar`, `services` |
| Media | `journalist`, `reporter`, `news-outlet`, `podcast`, `blogger` |
| Venues & Arts | `music-venue`, `gallery`, `event-space` |
| Community | `nonprofit`, `organization`, `collective` |

Defined in `CATEGORY_HIERARCHY` in `src/react-app/types.ts`. The worker duplicates the label map inline (`WORKER_CATEGORY_LABELS`) for OG meta tag generation, since it cannot import from the React tsconfig target.

### Verification (Admin)
- Admin can set `verified = true` on any user
- Unverified users can have a profile and links, but do not appear in the directory
- Simple admin-only route for managing the queue

### Analytics (`/analytics`)

Profile owners see a dashboard at `/analytics` showing views and link clicks over time, geo breakdown, browser/device breakdown, traffic source classification, and per-link click performance. Accessible from the profile page owner bookmark tab (BarChart2 icon) and from the cog dropdown on the dashboard.

**Data sources:**
- Cloudflare Workers injects geolocation on every request for free via `request.cf` (`country`, `city`). No external IP-lookup API needed. IP addresses are never stored.
- User-agent parsing (in `src/worker/analytics.ts`) gives browser, OS, and device type.
- `Referer` header gives traffic source, classified into `direct`, `social`, `search`, or `referral`.

**Tracking endpoints** (public, bot-filtered, self-view/self-click prevention via optional JWT auth):
- `POST /api/track/view` — fired by ProfilePage on load; returns `eventId`
- `POST /api/track/duration` — fired by ProfilePage via `navigator.sendBeacon` on unmount; updates `duration_ms` on the view event (only if the caller's recomputed `visitor_hash` matches the event row)
- `POST /api/track/click` — fired via `navigator.sendBeacon` when a link is clicked

**Retention strategy:**
- Raw events kept for 30 days in `page_view_events` and `link_click_events`, then purged by the nightly Cron Trigger.
- The Cron Trigger (06:00 UTC daily) aggregates the previous day's events into `page_view_daily` and `link_click_daily` (one row per profile/link per day), kept indefinitely.
- `GET /api/me/analytics?period=7d|30d` queries raw event tables; `?period=90d|all` queries the daily rollup tables.

**What's tracked per page view:** `profile_id`, `timestamp`, `country`, `city`, `browser`, `os`, `device_type`, `referrer`, `visit_kind`, `duration_ms`. No PII, no IP address.

**What's tracked per link click:** `link_id`, `profile_id`, `timestamp`, `country`, `referrer`, `visit_kind`.

## Post-MVP

These features are explicitly out of scope until the MVP is stable.

### Categories & Filtering
- Filter the home page directory by category (not yet wired up in the UI — grouped view exists but no filter persistence or URL params)
- Multi-category multi-select is fully shipped (25 subcategory slugs, see Category Hierarchy in MVP section)

### Verification Self-Service
- User submits a Louisville address or social proof
- Admin review queue in the dashboard
- Email notification on approval/rejection

### Social Features
- "Endorse" or "Follow" another Louisville user
- Curated collections ("Top Louisville Musicians")

### OAuth Login
- Sign in with Google or GitHub
- Still requires Louisville verification to appear in the directory

## What Never Goes In

- AI-generated images or text (the platform is about real people, real work)
- Paid tiers or paywalled features (community resource, stays free)
- Global/non-Louisville users (the Louisville focus is the product's identity)
