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
- Per-link click counts
- Profile view counts
- Store events in a KV or D1 table, aggregate in a dashboard widget

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
