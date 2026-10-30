# AGENTS.md

## Project Overview
SHIELDAgents landing pages and backend — high-converting security, protocol, and asset-protection landing pages.

## Stack
- **Frontend & Backend**: Static HTML5, CSS3, and JavaScript (Matrix-themed UI with custom canvas animations and scanlines).
- **Database (Cloudflare D1)**: Exactly four tables only — `users`, `bookings`, `media`, `registry`. Do not add tables without asking.
- **Storage (Cloudflare R2)**: Ephemeral AI-generated images go to R2 with auto-delete after delivery. Permanent assets like staff photos go to R2 with long retention. The `media` table stores only metadata and R2 keys — never file contents.
- **Hosting & Deployment**: Cloudflare Pages, deployed via `npx wrangler pages deploy . --project-name=sa-landing-pages`.
- **Version Control**: GitHub repository `SHIELDAgents/SA-Landing-Pages`.

## Conventions & Git
- `index.html` is the primary and only entry point and must always stay at the repository root.
- AGENTS.md lives in the repo root and must be read before any change.
- Never create new HTML files or subpages unless explicitly requested.
- When deploying updates live, run `npx wrangler pages deploy . --project-name=sa-landing-pages` from the repository root.
- **Git workflow**: Commit locally after every change with a summary of what changed. **Never push automatically**. Only push to GitHub when the user explicitly says push. Never push unfinished work.

## Bookings State Machine
The `bookings` table has a `status` column that operates as a state machine with exactly these states in order:
1. `purchased`
2. `photo received`
3. `image generated`
4. `image sent`
5. `post confirmed`
6. `influencer comment confirmed`
7. `payment released`

- An agent may only act on a row when it enters that agent's state.
- Payment release requires the influencer's comment ID as proof — never trigger it early or twice.

## Domain
- `shield-agents.store` is the custom domain, already active and linked to Cloudflare Pages.

## Brand Bible — Shield AP

- **Brand**: Shield AP (Anti-aging Protocol / Content Protection Protocol)
- **Tagline**: SHIELD YOUR CONTENT. GET PAID WHEN THEY TRY.
- **Essence**: Value your peace. We shield it.

### Vision — 3 Avenues, One Shield
Shield is not antivirus. Shield is a protocol stack that builds the shielded self. Like Tetris blocks stacking, each protocol interlocks to build something bigger than the sum.

#### Avenue 1 — VIRTUAL (Current — Build Now)
Pay Per Crawl Print Flow, Leak Check, Privacy Protocol, Bolt, Pre-Block, TAKE IT DOWN Act filer, Fake Googlebot detector, Shield Protected Badge.
- *Free value first*: Free scan, free badge, free dashboard showing "47 scrapes, $4.20 owed". We only take 70/30 when they PRINT. No upfront charge. Trust over cash.
- *Design feel*: Terminal, hacker, Matrix, live stats, Cloudflare intel, 402 handshake. Not corporate. Print cash vibe.

#### Avenue 2 — PHYSICAL (Fed by Virtual)
Women agents providing presence and elevation for travelers. Not macho guard, but presence that elevates. Trust + operations, not cash. Virtual trust feeds physical coordination. 70/30 split same as digital. Real operations, real people, real aura elevation.
- *Design feel*: Hospitality + security, elevated presence, confidence, peace, not intimidation. Female energy, safe, premium.

#### Avenue 3 — ULTIMATE (Top Secret — The Game — 30-50 BTC Product)
Open world game representing Shield real operations. Only way to pass is elevate people's aura, protect people's peace. Do dumb shit like old games, get jailed, no progress. Do Shield missions (real virtual + physical protocols), elevate aura, level up status.
Trillionaire Ghost Protocol = Premium 30-50 BTC product where buyer crafts own character that lives forever. From broke to trillionaire, all want it but can't buy it with money: they want to be hero to their kids, craft legacy. Money doesn't impress family anymore. Character does. When you die, family plays as your ghost character. Legacy as a service.
- *Design feel*: Top notch AAA game feel, not SaaS. Tetris blocks stacking into character. Ghost protocol, legacy, crafting, aura, elevation. Think prestige, not childish. The website itself should hint at this game without ever saying "GTA" — gamey UI, blocks, levels, character progression, print flow.

### Brand Image Rules for All Pages
1. **Game Feel Over Corporate**: Every page should feel like top notch game UI, not antivirus dashboard. Use Tetris block stacking visual, levels, XP, aura meters, live counts, not boring tables.
2. **Print With Protocols**: Language is "Print", "Print Flow", "Print Cash", "Print With Protocols", "Turn Bots Into Cash". Not "dashboard" or "analytics". Print is money, print is protocols, print is you.
3. **Human Language Front, Tech Hover Reveal**: Main copy human: "Shield My Content", "Delete My Leaks & Deepfakes", "Turn Bots Into Cash + Print With Protocols". On hover, reveal tech: "Pay Per Crawl 402 + Stripe Payout", "TAKE IT DOWN Act 48h + $53k", "Cloudforce One Botnet Threat Feed".
4. **Ghost Protocol**: Everything builds toward becoming ghost — invisible to scrapers, trackers, leaks when you want, highly present when you choose. Peace = ghost + presence.
5. **Anti-aging = Anti-drain**: Shield AP originally Anti-aging Protocol — because leaks, scrapes, travel stress, being tracked ages you. Shield stops drain, preserves peace, thus anti-aging. Elevation, not just protection.
6. **Never Mention**: Never mention DMCA.com, never mention GTA in public copy. GTA only used internally as hint for game feel. DMCA is 1998 law, we are 2026. We replace, not mention.
7. **Badge**: Shield Protected badge is live, verifiable, dynamic SVG showing handle + live stats, links to `URL+{handle}`. Replaces old static DMCA JPG. Game achievement, not corporate badge.

## License
- MIT.
