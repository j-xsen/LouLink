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

### Account Creation
- Register with email + password
- Choose a username (URL slug)
- Basic profile setup: display name, bio, category
- Photo upload to Contentful

### Link Management (Dashboard)
- Add, edit, delete links
- Reorder links (drag or up/down buttons)
- Toggle link visibility

### Verification (Admin)
- Admin can set `verified = true` on any user
- Unverified users can have a profile and links, but do not appear in the directory
- Simple admin-only route for managing the queue

## Post-MVP

These features are explicitly out of scope until the MVP is stable.

### Analytics

Profile owners see a dashboard showing views over time, top referring cities, device breakdown, and referrer sources — similar to Umami but built-in.

**Data sources:**
- Cloudflare Workers injects geolocation on every request for free via `request.cf` (`country`, `city`, `region`). No external IP-lookup API needed. IP addresses are never stored.
- User-agent parsing gives browser, OS, and device type.
- `Referer` header gives traffic source.

**Retention strategy:**
- Raw events kept for 30 days in `page_view_events`, then purged.
- A nightly Cloudflare Cron Trigger aggregates the previous day's events into `page_view_daily` (one row per profile per day), which is kept indefinitely.
- Users see full per-event detail for the last 30 days; older data shows as aggregated daily totals.

**What's tracked per event:** `profile_id`, `timestamp`, `country`, `city`, `browser`, `os`, `device_type`, `referrer`. No PII, no IP address.

### Categories & Filtering
- Filter the home page directory by category
- Users select one primary category on signup

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

### Profile Themes
- User picks a color scheme or layout from a small set of options
- No custom CSS — prevents abuse and keeps pages consistent

## What Never Goes In

- AI-generated images or text (the platform is about real people, real work)
- Paid tiers or paywalled features (community resource, stays free)
- Global/non-Louisville users (the Louisville focus is the product's identity)
