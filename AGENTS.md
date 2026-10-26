# AGENTS.md

## Project Overview
SHIELDAgents landing pages — high-converting security, protocol, and asset-protection landing pages.

## Stack
- **Frontend**: Static HTML5, CSS3, and JavaScript (Matrix-themed UI with custom canvas animations and scanlines).
- **Hosting & Deployment**: Cloudflare Pages (project name: `sa-landing-pages`, custom domain: `shield-agents.store`).
- **Version Control**: GitHub repository `SHIELDAgents/SA-Landing-Pages`.

## Conventions
- `index.html` is the primary and only entry point and must always stay at the repository root.
- After every change, commit and push to GitHub automatically (`git add`, `git commit`, `git push origin master`).
- When deploying updates live, run `npx wrangler pages deploy . --project-name=sa-landing-pages` from the repository root.
- Never create new HTML files or subpages unless explicitly requested.

## Domain
- `shield-agents.store` is the custom domain, already active and linked to Cloudflare Pages.

## License
- MIT.
