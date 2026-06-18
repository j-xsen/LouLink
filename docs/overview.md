# LouLink — Project Overview

## What It Is

LouLink is a Louisville-specific competitor to Linktree. It gives Louisville artists and businesses a single shareable URL that aggregates all their online presences (Instagram, Bandcamp, Etsy, website, etc.) into one public profile page.

## What Makes It Different from Linktree

- **Louisville-only**: Every user on the platform must be verified as a Louisville-based person, business, or artist.
- **Public directory**: The home page is a browsable list of all verified Louisville users — a living directory of the local creative and business community, not just a private link page.
- **Community identity**: The platform is a statement of Louisville civic pride, not a generic SaaS tool.

## Target Users

- Local musicians, visual artists, photographers, makers
- Small businesses, restaurants, shops, studios
- Community organizations and collectives
- Anyone building a Louisville-centered audience

## Core User Flows

### New User (Onboarding)
1. Sign up with email or OAuth
2. Submit Louisville verification (address, social proof, or manual review)
3. Build their link page: add name, bio, profile photo, and links
4. Page goes live at `loulink.com/<username>`

### Visitor (Discovery)
1. Lands on `loulink.com` — sees the full Louisville directory
2. Browses or searches by category/name
3. Clicks a profile → sees that person's link page
4. Clicks a link → leaves to external site

### Verified User (Management)
1. Logs in → dashboard
2. Edit links, reorder them, toggle visibility
3. Update bio, display name, and profile photo (stored in Cloudflare R2)
4. Customize profile appearance (theme, colors, avatar shape)
5. Manage social media profile links
6. View analytics dashboard (page views, link clicks, geo, device, traffic source)
7. Toggle directory visibility (verified users only)

## Verification Model

Verification keeps the directory trustworthy and is entirely admin-controlled. The `profiles.verified` boolean is the sole mechanism — an admin sets it to `true` via the admin dashboard (`/admin`, localhost-only, secured by `ADMIN_KEY`). Unverified users have a profile and links but are excluded from the home page directory.
