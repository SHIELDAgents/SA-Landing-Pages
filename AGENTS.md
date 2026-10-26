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

## License
- MIT.
