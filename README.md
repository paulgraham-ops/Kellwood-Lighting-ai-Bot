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

## AWS release model

Packaged as a Node 20 container (`Dockerfile`, `/api/health` as the healthcheck). Pushing `main` builds and publishes `latest` and commit-sha tags to the `eskdale-kellwood` Amazon ECR repository through GitHub OIDC (`.github/workflows/build-image.yml`). The image is intended for the existing CMS AWS ECS/Fargate platform in `eu-west-1`: cluster `eskdale`, shared ALB `eskdale-web`, port `3000`, target health path `/api/health`, domain `kellwood.webbiz.co.uk`.

Build/run locally:

```
docker build -t kellwood-brainy-bot .
docker run -p 3000:3000 --env-file .env kellwood-brainy-bot
```

Before enabling a production release, an AWS administrator must (none of this is done yet):

1. Create the `eskdale-kellwood` ECR repository (lifecycle/scanning policy matching the other `eskdale-*` repos).
2. Create an IAM OIDC role scoped to `repo:paulgraham-ops@*/Kellwood-Lighting-ai-Bot@*:ref:refs/heads/main` (use the numeric-ID `StringLike` pattern from `CMS/infra/aws/20-github-oidc.sh` — a role provisioned with only the classic `repo:<owner>/<repo>:ref:...` pattern silently fails every assume under this org's OIDC settings, as happened with festaffapp), then save its ARN as the repo secret `AWS_ROLE_ARN`.
3. Create a dedicated ECS task definition, target group, and service on the `eskdale` cluster using the pushed image, port `3000`, health check path `/api/health`. No database or extra runtime secrets beyond `ANTHROPIC_API_KEY` are needed.
4. Add a unique HTTPS ALB listener rule for `Host: kellwood.webbiz.co.uk` on the shared `eskdale-web` ALB, forwarding to this target group. Never replace the ALB's default action — other sites depend on it.
5. Confirm the `kellwood.webbiz.co.uk` DNS record (already pointed at the shared ALB) is included in the ACM certificate for that ALB's HTTPS listener.

Keep this private until Paul signs off on client access — see the note at the top of this file.
