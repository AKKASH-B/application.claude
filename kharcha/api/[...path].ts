import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handle } from "../server/router";
import { HttpError } from "../server/util";

// One catch-all function serves the whole API (keeps us far below Vercel Hobby's function limit).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;
  const allowed = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const url = new URL(req.url || "/", "http://localhost");
    const reply = await handle({
      method: req.method || "GET",
      path: url.pathname.replace(/^\/api/, "") || "/",
      query: url.searchParams,
      body: req.body,
      authorization: req.headers.authorization,
    });
    if (reply.contentType) {
      res.setHeader("Content-Type", reply.contentType);
      return res.status(reply.status).send(reply.data as string);
    }
    return res.status(reply.status).json(reply.data);
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error("API error:", e);
    return res.status(500).json({ error: "Something went wrong on our side. Please try again." });
  }
}
