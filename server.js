import "dotenv/config";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

const knowledgeBase = fs.readFileSync(
  path.join(__dirname, "docs", "kellwood-research.md"),
  "utf8",
);

const SYSTEM_PROMPT = `You are the Kellwood Brainy Bot, a friendly, precise product-and-company assistant for Kellwood Lighting (kellwoodlighting.co.uk), a UK commercial/industrial LED lighting manufacturer based in Dumfries, Scotland.

Answer ONLY from the knowledge base below. If something isn't in it (a series, a spec, pricing), say plainly that it isn't in your current research rather than guessing or inventing numbers.

Keep answers concise and scannable (short paragraphs or a few bullet points), cite specific series names and figures when relevant, and use British English spelling. This is a client-facing demo, so keep a professional, confident tone.

=== KNOWLEDGE BASE ===
${knowledgeBase}`;

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

if (!anthropic) {
  console.warn(
    "ANTHROPIC_API_KEY is not set — /api/chat will return 503 until it is configured (see .env.example).",
  );
}

// Basic per-IP rate limit: keeps a stray script or a curious visitor from
// running up the API bill on a publicly reachable demo.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const hits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  timestamps.push(now);
  hits.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT;
}

const app = express();
app.use(express.json({ limit: "64kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, anthropic: Boolean(anthropic) });
});

app.post("/api/chat", async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({ error: "Server is missing ANTHROPIC_API_KEY." });
  }
  if (isRateLimited(req.ip)) {
    return res.status(429).json({ error: "Too many requests — please wait a moment." });
  }

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;
  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: "Expected a non-empty messages array." });
  }
  const clean = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  if (clean.length === 0 || clean[clean.length - 1].role !== "user") {
    return res.status(400).json({ error: "The last message must be from the user." });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: clean,
  });

  stream.on("text", (delta) => send("delta", { delta }));
  stream.on("error", (err) => {
    console.error("Anthropic stream error:", err);
    send("error", { message: "Something went wrong talking to Claude." });
    res.end();
  });

  req.on("close", () => stream.abort());

  try {
    const finalMessage = await stream.finalMessage();
    const stopReason = finalMessage.stop_reason;
    send("done", { truncated: stopReason === "max_tokens" });
  } catch (err) {
    if (err?.name !== "APIUserAbortError") {
      console.error("Anthropic request failed:", err);
      send("error", { message: "Something went wrong talking to Claude." });
    }
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Kellwood Brainy Bot listening on port ${PORT}`);
});
