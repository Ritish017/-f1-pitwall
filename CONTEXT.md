# Project Context — f1-pitwall

> Durable working state for this repo. Read this FIRST in any session before making changes.
> Update this file after every completed task (feature, fix, deploy) so state survives context compaction.

## What this is
Live Formula 1 Race Intelligence & Telemetry Dashboard (pit wall). Node/Express server serving a static SPA.
- Repo root: this directory
- App: `site/` (server.js + `site/public/index.html` SPA, inline JS)
- API routes: `api/*.js` (Vercel Functions)
- Vercel config: root `vercel.json` → static output `site/public`, serverless `api/`

## How to run / verify
- Local: `cd site && npm install && node server.js` → `http://localhost:3000` (respects `PORT` env).
- **Port 3000 note:** an unrelated "OpenJarvis" Vite dev server (PID was 18160) sometimes squats on :3000. If EADDRINUSE, use `PORT=3001 node server.js` or free the port.
- Lint: `npm run lint` (runs `node --check` on server.js + api/*.js)
- Inline JS syntax check (no node modules needed):
  `node -e 'const fs=require("fs");const h=fs.readFileSync("site/public/index.html","utf8");const m=h.match(/<script>([\s\S]*?)<\/script>/);new Function(m[1]);console.log("OK")'`

## Current feature state — F1 Live stream integration (COMPLETE, deployed)
Goal: watch the live F1 stream inside the app. Recon of `https://f1net1.dpdns.org/stream/fullhd1` revealed:
- That URL is a web dashboard (F1Net), NOT a video file. No custom HLS/DASH anywhere in its bundle.
- The live F1 video is a **Twitch stream on channel `adiiixexe`**.
- **Brazil VPN required:** Twitch region-gates the live F1 broadcast to Brazil — the VPN masks egress to Brazil so Twitch unlocks it (a VPN cannot be applied in-browser; it must be on the network/device).

### Implemented in `site/public/index.html`
- **Twitch player embed** (`player.twitch.tv/?channel=adiiixexe&parent=<host>`) shown in a hidden `<iframe id="streamTwitch">` inside the stream panel, toggled via `.stream-body.twitch` CSS class.
- **Auto-detection** `twitchChannelOf(url)` / `isF1Source(url)`: `f1net*.dpdns.org/stream/*`, `twitch:channel`, bare channel, `twitch.tv/channel`.
- **Multi-candidate instant-failover** `streamCandidates()`: F1 sources → `[twitch embed, f1net dashboard, twitch.tv channel]`; tries next on error or ~6s timeout (`loadStream._attempt` guard against stale runs).
- **VPN hint banner** `#streamVpnHint` ("⚠ F1 live is geo-restricted — turn on a Brazil VPN and reload"), `.stream-vpn-hint` CSS (var(--warn,#f5c518)).
- Prior `loadStream` improvements retained: fatal-error classification ("Fatal error: unable to load stream manifest"), distinguishable manifest failure ("HLS manifest could not be parsed"), native error codes ("Unable to load stream (error N)").
- **`parent` = `location.hostname`** (Twitch embed requirement). Local works (`localhost`).

### ⚠ Known caveat (deployed, NOT yet resolved)
The F1Net bundle's Twitch `parent` allowlist is `[localhost, www.f1net.dpdns.org, f1net.dpdns.org, f1net1.dpdns.org, f1net.vercel.app]`.
**`ritish-pitwall.vercel.app` is NOT on that allowlist.** So the Twitch iframe may be blocked on the deployed Vercel domain (works locally on localhost). If the live embed shows a Twitch error box instead of video, this is the cause — needs a Twitch-verified parent origin or a different approach.

## Deployments
- GitHub: `https://github.com/Ritish017/-f1-pitwall` (branch `main`, conventional commits: `feat:`/`fix:`/`chore:`).
- Vercel project: `f1-pitwall` (account ritish017) → **Production URL: https://ritish-pitwall.vercel.app**
- Local Vercel link exists (`.vercel` gitignored). `vercel --prod` deploys from this dir.
- `vercel git connect` NOT enabled → pushes do NOT auto-deploy; must run `vercel --prod` manually.
- Latest deployed commit: `01e87a5` (feat: integrate F1 live Twitch stream embed with fallback and Brazil-VPN handling).

## Repo conventions
- Conventional commits (`feat:`, `fix:`, `chore:`).
- Only real dependency: `ws` (^8.18.0).
- `.vercel` and `.env*` are gitignored.
- Key files: `site/public/index.html` (SPA + inline JS), `site/server.js`, `api/*.js`, `vercel.json`.