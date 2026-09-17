# Kellwood Lighting AI Bot

**Kellwood Brainy Bot** — a chat assistant that answers questions about Kellwood Lighting's company and product range, grounded in `docs/kellwood-research.md`.

Internal demo. Not for external/client access until explicitly signed off.

## Run locally

```
npm install
cp .env.example .env   # then fill in ANTHROPIC_API_KEY
npm start              # or: npm run dev (auto-restarts on file changes)
```

Open http://localhost:3000. `GET /api/health` reports `{ ok, anthropic }` — `anthropic: false` means the API key isn't set yet, and `/api/chat` will 503 until it is.

## How it works

- `server.js` — Express app. Serves the static frontend from `public/`, reads `docs/kellwood-research.md` at startup and uses it as the system prompt for `POST /api/chat`, which streams Claude's answer back over Server-Sent Events. A light per-IP rate limit (20 requests / 10 min) guards the API key from abuse.
- `public/` — plain HTML/CSS/JS chat UI. No build step, no framework.
- The bot answers **only** from the research doc, and says so plainly when asked about something not yet researched (pricing, the still-uncovered product series) rather than inventing an answer.

To extend its knowledge, edit `docs/kellwood-research.md` and restart the server — no code changes needed.

## Deploying

Containerized with the included `Dockerfile` (Node 20, `/api/health` as the container healthcheck) for the same AWS setup the Eskdale Platform CMS sites use — ECS Express Mode behind a shared Application Load Balancer. Target domain: `kellwood.webbiz.co.uk`.

```
docker build -t kellwood-brainy-bot .
docker run -p 3000:3000 --env-file .env kellwood-brainy-bot
```

Provisioning the ECR repo, Fargate service and ALB routing for `kellwood.webbiz.co.uk` is a separate infra step, not yet done.
