// oauth-hub — Standalone whitelabel hub for Meta channels.
// Copyright (C) 2026 Comunidade ZDG
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of version 3 of the GNU Affero General Public License as
// published by the Free Software Foundation.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
//
// Source: https://github.com/pedroherpeto/oauth-hub-zdg

// ─────────────────────────────────────────────────────────────────────────────
// oauth-hub — standalone whitelabel hub (multi-app).
// Connects Meta channels (WhatsApp Business, Messenger, Instagram) via each
// registered app's own OAuth, receives + displays their webhook interactions,
// and routes (forwards) those webhooks per-app to other endpoints.
// No external license check and no dependency on any other backend.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";

import {
  PORT,
  PUBLIC_URL,
  ADMIN_PASSWORD,
  WEBHOOK_DEBUG_LOG,
  DEFAULT_API_VERSION,
  FORWARD_TIMEOUT_MS,
  getBrand,
  getGlobalPublicConfig,
  toPublicApp,
  instagramCredsFor,
  appWebhookUrls,
  appRedirectUri,
  seedAppFromEnvIfEmpty,
} from "./config";
import {
  requireAdmin,
  issueSession,
  passwordMatches,
  encodeState,
  decodeState,
  verifyWebhookSignature,
  newId,
} from "./security";
import * as store from "./store";
import * as meta from "./meta";
import * as evidence from "./evidence";
import { tServer, localesScript, normalizeLang, reloadLocales } from "./i18n";
import { parseWebhook } from "./webhook-parse";
import * as leads from "./leads";
import { attachTerminal, isTerminalEnabled } from "./terminal";
import { Channel, ChannelPublic, ChannelType, ForwardDest, ForwardProduct, MetaApp, WebhookEvent } from "./types";

const app = express();

app.use(
  express.json({
    limit: "2mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.set("trust proxy", 1);
app.use(cors());

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 2000, standardHeaders: true, legacyHeaders: false });

// ─── Helpers ────────────────────────────────────────────────────────────────
function toPublicChannel(c: Channel): ChannelPublic {
  const { accessToken: _t, ...rest } = c;
  return { ...rest, appName: store.findApp(c.appId)?.name || "(app removido)" };
}

function serveTemplate(res: Response, file: string, replacements: Record<string, string>): void {
  try {
    let html = fs.readFileSync(path.join(__dirname, "..", "public", file), "utf-8");
    for (const key of Object.keys(replacements)) {
      html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), () => replacements[key]);
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch {
    res.status(500).send("Template not found");
  }
}

function htmlEscape(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderResultPage(res: Response, ok: boolean, lang: string, titleKey: string, msgKey: string, vars?: Record<string, string | number>): void {
  const L = normalizeLang(lang);
  const title = tServer(L, titleKey);
  const message = tServer(L, msgKey, vars);
  const back = tServer(L, "result.back");
  const footer = tServer(L, "result.footer");
  const knowZpro = tServer(L, "result.knowZpro");
  const color = ok ? "#16a34a" : "#dc2626";
  const icon = ok
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>';
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html><html lang="${L}"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${htmlEscape(title)} · InoovaWeb</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#f3f4f7;--card:#fff;--text:#0a0d15;--muted:#5b6473;--border:#e7e9f1}
  @media (prefers-color-scheme:dark){:root{--bg:#07090f;--card:#11141d;--text:#e9eef7;--muted:#96a0b1;--border:#1f232f}}
  body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:1rem;color:var(--text);background:radial-gradient(760px 440px at 100% -10%,rgba(238,106,12,.18),transparent 60%),var(--bg)}
  .box{text-align:center;padding:2.5rem 2rem;max-width:440px;width:100%;background:var(--card);border:1px solid var(--border);border-radius:20px;box-shadow:0 30px 70px -22px rgba(8,12,22,.45)}
  .icon{margin-bottom:1rem}
  .icon svg{width:54px;height:54px}
  h3{font-size:1.15rem;font-weight:800;letter-spacing:-.02em;margin-bottom:.5rem;color:${color}}
  p{font-size:.9rem;color:var(--muted);line-height:1.55}
  a.back{display:inline-block;margin-top:1.3rem;padding:.65rem 1.4rem;background:linear-gradient(180deg,#ff8a2a,#ec6a0c);color:#fff;border-radius:11px;text-decoration:none;font-size:.85rem;font-weight:700;box-shadow:0 12px 26px -10px rgba(238,106,12,.85)}
  .promo-foot{margin-top:1.3rem;font-size:.76rem;color:var(--muted);text-align:center}
  .promo-foot a{color:#d9600a;font-weight:700;text-decoration:none}
</style></head><body>
<div class="box">
  <div class="icon">${icon}</div>
  <h3>${htmlEscape(title)}</h3>
  <p>${htmlEscape(message)}</p>
  <a class="back" href="/">${htmlEscape(back)}</a>
</div>
<div class="promo-foot">
  <a href="https://inoovaweb.com.br" target="_blank" rel="noopener">${htmlEscape(footer)}</a> · <a href="https://inoovaweb.com.br" target="_blank" rel="noopener">${htmlEscape(knowZpro)}</a>
</div>
<script>
  try { if (window.opener) { window.opener.postMessage({ type: 'hub:connected', ok: ${ok ? "true" : "false"} }, window.location.origin); setTimeout(function(){ window.close(); }, 2500); } } catch(e){}
</script>
</body></html>`);
}

function sanitizeForwards(input: any): ForwardDest[] {
  if (!Array.isArray(input)) return [];
  const valid: ForwardProduct[] = ["all", "waba", "messenger", "instagram"];
  const out: ForwardDest[] = [];
  for (const f of input) {
    if (!f || typeof f.url !== "string") continue;
    const url = f.url.trim();
    if (!/^https?:\/\//i.test(url)) continue;
    let products: ForwardProduct[] = Array.isArray(f.products)
      ? f.products.filter((p: any) => valid.includes(p))
      : ["all"];
    if (!products.length) products = ["all"];
    out.push({
      id: typeof f.id === "string" && f.id ? f.id : newId(),
      url,
      products,
      enabled: f.enabled !== false,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC bootstrap + login
// ─────────────────────────────────────────────────────────────────────────────
// Roteamento de leads do Facebook por Página (sistemas/CRMs que usam o mesmo app).
app.use(["/api/lead-clients", "/api/lead-routes", "/api/leads"], apiLimiter);
app.use(leads.leadsRouter());

app.get("/api/bootstrap", apiLimiter, (_req: Request, res: Response) => {
  res.json({ brandName: getBrand(), adminAuthEnabled: !!ADMIN_PASSWORD, terminalEnabled: isTerminalEnabled() });
});

app.post("/api/login", loginLimiter, (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  if (!ADMIN_PASSWORD) return res.json({ token: issueSession(), openMode: true });
  if (!passwordMatches(password || "")) return res.status(401).json({ error: "INVALID_PASSWORD" });
  return res.json({ token: issueSession(), openMode: false });
});

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL config (admin)
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/config", apiLimiter, requireAdmin, (_req: Request, res: Response) => {
  res.json(getGlobalPublicConfig());
});

app.post("/api/settings", apiLimiter, requireAdmin, (req: Request, res: Response) => {
  const b = req.body as Record<string, any>;
  if (typeof b.brandName === "string") store.saveSettings({ brandName: b.brandName.trim() });
  res.json(getGlobalPublicConfig());
});

// ─────────────────────────────────────────────────────────────────────────────
// APPS CRUD (admin)
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/apps", apiLimiter, requireAdmin, (_req: Request, res: Response) => {
  res.json({ apps: store.listApps().map(toPublicApp) });
});

app.post("/api/apps", apiLimiter, requireAdmin, (req: Request, res: Response) => {
  const b = req.body as Record<string, any>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const appId = typeof b.appId === "string" ? b.appId.trim() : "";
  if (!name) return res.status(400).json({ error: "NAME_REQUIRED" });
  if (!appId) return res.status(400).json({ error: "APP_ID_REQUIRED" });
  const now = new Date().toISOString();
  const created: MetaApp = {
    id: newId().slice(0, 10),
    name,
    appId,
    appSecret: typeof b.appSecret === "string" ? b.appSecret.trim() : "",
    apiVersion: (typeof b.apiVersion === "string" && b.apiVersion.trim()) || DEFAULT_API_VERSION,
    wabaConfigId: typeof b.wabaConfigId === "string" ? b.wabaConfigId.trim() : "",
    messengerConfigId: typeof b.messengerConfigId === "string" ? b.messengerConfigId.trim() : "",
    instagramAppId: typeof b.instagramAppId === "string" ? b.instagramAppId.trim() : "",
    instagramAppSecret: typeof b.instagramAppSecret === "string" ? b.instagramAppSecret.trim() : "",
    messengerFallbackToken: typeof b.messengerFallbackToken === "string" ? b.messengerFallbackToken.trim() : "",
    webhookVerifyToken: typeof b.webhookVerifyToken === "string" ? b.webhookVerifyToken.trim() : "",
    forwards: sanitizeForwards(b.forwards),
    storeEvents: b.storeEvents !== false,
    embedEnabled: b.embedEnabled === true,
    createdAt: now,
  };
  store.addApp(created);
  res.json({ app: toPublicApp(created) });
});

app.put("/api/apps/:id", apiLimiter, requireAdmin, (req: Request, res: Response) => {
  const existing = store.findApp(req.params.id);
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
  const b = req.body as Record<string, any>;
  const patch: Partial<MetaApp> = {};
  if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim();
  if (typeof b.appId === "string" && b.appId.trim()) patch.appId = b.appId.trim();
  if (typeof b.apiVersion === "string") patch.apiVersion = b.apiVersion.trim() || DEFAULT_API_VERSION;
  if (typeof b.wabaConfigId === "string") patch.wabaConfigId = b.wabaConfigId.trim();
  if (typeof b.messengerConfigId === "string") patch.messengerConfigId = b.messengerConfigId.trim();
  if (typeof b.instagramAppId === "string") patch.instagramAppId = b.instagramAppId.trim();
  if (typeof b.webhookVerifyToken === "string") patch.webhookVerifyToken = b.webhookVerifyToken.trim();
  // Secrets/tokens: only overwrite when a non-empty value is sent; "__clear__" wipes it.
  if (typeof b.appSecret === "string" && b.appSecret.trim()) patch.appSecret = b.appSecret.trim();
  if (typeof b.instagramAppSecret === "string" && b.instagramAppSecret.trim()) patch.instagramAppSecret = b.instagramAppSecret.trim();
  if (typeof b.messengerFallbackToken === "string" && b.messengerFallbackToken.trim()) {
    patch.messengerFallbackToken = b.messengerFallbackToken.trim() === "__clear__" ? "" : b.messengerFallbackToken.trim();
  }
  if (b.forwards !== undefined) patch.forwards = sanitizeForwards(b.forwards);
  if (typeof b.storeEvents === "boolean") patch.storeEvents = b.storeEvents;
  if (typeof b.embedEnabled === "boolean") patch.embedEnabled = b.embedEnabled;
  const updated = store.updateApp(req.params.id, patch);
  res.json({ app: toPublicApp(updated!) });
});

app.delete("/api/apps/:id", apiLimiter, requireAdmin, (req: Request, res: Response) => {
  const ok = store.deleteApp(req.params.id);
  if (!ok) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHANNELS / EVENTS (admin)
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/channels", apiLimiter, requireAdmin, (_req: Request, res: Response) => {
  res.json({ channels: store.listChannels().map(toPublicChannel) });
});

app.delete("/api/channels/:id", apiLimiter, requireAdmin, (req: Request, res: Response) => {
  const removed = store.deleteChannel(req.params.id);
  if (!removed) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ ok: true });
});

// Refresh a channel's display details (avatar + fields) from the Graph API.
app.post("/api/channels/:id/refresh", apiLimiter, requireAdmin, async (req: Request, res: Response) => {
  const ch = store.findChannelById(req.params.id);
  if (!ch) return res.status(404).json({ error: "NOT_FOUND" });
  const appCfg = store.findApp(ch.appId);
  const apiVersion = appCfg?.apiVersion || DEFAULT_API_VERSION;
  try {
    const det = await meta.getChannelDetails(ch.type, ch.externalId, ch.meta, ch.accessToken, apiVersion);
    const newMeta = { ...(ch.meta || {}), avatar: det.avatar || (ch.meta && ch.meta.avatar) || "", details: det.fields };
    store.upsertChannel({ ...ch, meta: newMeta });
    const updated = store.findChannelById(ch.id);
    res.json({ ok: true, channel: updated ? toPublicChannel(updated) : null });
  } catch (err: any) {
    console.error("[channels/refresh] error:", err?.message || err);
    res.status(500).json({ error: "server_error" });
  }
});

// ─── Evidence (Meta App Review) — run real Graph calls per permission ─────────
app.get("/api/evidence/suites", apiLimiter, requireAdmin, (_req: Request, res: Response) => {
  const suites = Object.keys(evidence.SUITES).map((k) => ({
    key: k,
    label: evidence.SUITES[k].label,
    needs: evidence.SUITES[k].needs,
    groups: Array.from(new Set(evidence.SUITES[k].steps.map((s) => s.group))),
    writeCount: evidence.SUITES[k].steps.filter((s) => s.write).length,
  }));
  res.json({ suites });
});

app.post("/api/evidence/run", apiLimiter, requireAdmin, async (req: Request, res: Response) => {
  const b = req.body as Record<string, any>;
  const app = store.findApp(String(b.appId || ""));
  if (!app) return res.status(404).json({ error: "APP_NOT_FOUND" });
  const product = String(b.product || "");
  const suite = evidence.SUITES[product];
  if (!suite) return res.status(400).json({ error: "UNKNOWN_PRODUCT" });

  const source = String(b.source || "fallback");
  let token = "";
  const params = (b.params || {}) as Record<string, any>;
  let waba_id = typeof params.waba_id === "string" ? params.waba_id.trim() : "";
  let phone_number_id = typeof params.phone_number_id === "string" ? params.phone_number_id.trim() : "";
  let ig_id = typeof params.ig_id === "string" ? params.ig_id.trim() : "";
  let page_id = typeof params.page_id === "string" ? params.page_id.trim() : "";

  if (source === "fallback") {
    token = app.messengerFallbackToken || "";
    if (!token) return res.status(400).json({ error: "NO_FALLBACK_TOKEN" });
  } else if (source === "channel") {
    const ch = store.findChannelById(String(b.channelId || ""));
    if (!ch || ch.appId !== app.id) return res.status(404).json({ error: "CHANNEL_NOT_FOUND" });
    token = ch.accessToken || "";
    // Default the IDs from the channel's stored metadata.
    waba_id = waba_id || String(ch.meta?.waba_id || "");
    phone_number_id = phone_number_id || String(ch.meta?.phone_number_id || ch.externalId || "");
    ig_id = ig_id || String(ch.meta?.ig_user_id || ch.externalId || "");
    page_id = page_id || String(ch.meta?.page_id || ch.externalId || "");
  } else if (source === "paste") {
    token = typeof b.token === "string" ? b.token.trim() : "";
    if (!token) return res.status(400).json({ error: "NO_TOKEN" });
  } else {
    return res.status(400).json({ error: "BAD_SOURCE" });
  }

  const missing = suite.needs.filter((n) => !({ waba_id, phone_number_id, ig_id, page_id } as any)[n]);
  if (missing.length) return res.status(400).json({ error: "MISSING_PARAMS", missing });

  const ts = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const ctx: evidence.EvidenceCtx = {
    token, apiVersion: app.apiVersion, ts,
    waba_id, phone_number_id, ig_id, page_id,
    recipient: typeof params.recipient === "string" ? params.recipient.trim() : "",
  };
  const allowWrites = b.allowWrites === true;
  if (allowWrites && !ctx.recipient && product === "whatsapp" && suite.steps.some((s) => s.write && /messages/.test(s.path))) {
    return res.status(400).json({ error: "RECIPIENT_REQUIRED" });
  }

  try {
    const records = await evidence.runSuite(suite.steps, ctx, { allowWrites });
    const nowIso = new Date().toISOString();
    const doc = evidence.buildEvidenceDoc({ product, appId: app.appId, apiVersion: app.apiVersion, ctx, records, tokens: [token], nowIso });
    const filename = `evidencia-app-${app.appId}-${product}-${ts}.txt`;
    const safeRecords = JSON.parse(evidence.scrubTokens(JSON.stringify(records), [token]));
    const summary = { total: records.length, ok: records.filter((r) => r.ok).length, fail: records.filter((r) => !r.ok && !r.skipped).length, skipped: records.filter((r) => r.skipped).length };
    console.log(`[evidence] app=${app.id} product=${product} source=${source} ok=${summary.ok}/${summary.total}`);
    res.json({ ok: true, records: safeRecords, doc, filename, summary });
  } catch (err: any) {
    console.error("[evidence] error:", err?.message || err);
    res.status(500).json({ error: "server_error" });
  }
});

app.get("/api/events", apiLimiter, requireAdmin, (req: Request, res: Response) => {
  const since = typeof req.query.since === "string" ? req.query.since : undefined;
  const limit = Math.min(200, Number(req.query.limit) || 100);
  res.json({ events: store.listEvents(since, limit) });
});

app.post("/api/events/clear", apiLimiter, requireAdmin, (_req: Request, res: Response) => {
  store.clearEvents();
  res.json({ ok: true });
});

app.get("/api/stats", apiLimiter, requireAdmin, (_req: Request, res: Response) => {
  const channels = store.listChannels();
  const byType: Record<string, number> = { waba: 0, messenger: 0, instagram: 0 };
  let subscribed = 0;
  for (const c of channels) {
    byType[c.type] = (byType[c.type] || 0) + 1;
    if (c.subscribed) subscribed++;
  }
  const es = store.eventStats();
  res.json({
    apps: store.listApps().length,
    channels: channels.length,
    channelsByType: byType,
    subscribed,
    eventsTotal: es.total,
    eventsLastHour: es.lastHour,
    forwardsLastHour: es.forwardsLastHour,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONNECT — init (admin) returns a signup URL carrying a signed state (channel+app)
// ─────────────────────────────────────────────────────────────────────────────
app.post("/api/connect/:channel/init", apiLimiter, requireAdmin, (req: Request, res: Response) => {
  const channel = req.params.channel as ChannelType;
  if (!["waba", "messenger", "instagram"].includes(channel)) return res.status(400).json({ error: "INVALID_CHANNEL" });
  const appId = String((req.body && req.body.appId) || "");
  const appCfg = store.findApp(appId);
  if (!appCfg) return res.status(400).json({ error: "APP_NOT_FOUND", message: "Selecione um app válido." });
  if (!appCfg.appId || !appCfg.appSecret) {
    return res.status(400).json({ error: "APP_NOT_CONFIGURED", message: "Este app precisa de App ID e App Secret." });
  }
  // Nota: o WhatsApp exige wabaConfigId, mas NÃO bloqueamos aqui — o popup abre e
  // informa o que falta (decisão de UX). Os demais canais não usam config id.
  const lang = normalizeLang(req.body && req.body.lang);
  const state = encodeState(channel, appId, lang);
  res.json({ url: `${PUBLIC_URL}/connect/${channel}?state=${encodeURIComponent(state)}&lang=${lang}` });
});

// Resolve the app from a signed state (used by the signup pages/exchanges).
function appFromState(stateRaw: string): { state: ReturnType<typeof decodeState>; app: MetaApp | undefined } {
  const state = decodeState(stateRaw);
  return { state, app: state ? store.findApp(state.appId) : undefined };
}
function langOf(req: Request, decoded?: ReturnType<typeof decodeState>): string {
  return (decoded && decoded.lang) || normalizeLang(req.query.lang as string);
}

app.get("/connect/waba", (req: Request, res: Response) => {
  const { state, app } = appFromState(String(req.query.state || ""));
  const lang = langOf(req, state);
  if (!state || !app) return renderResultPage(res, false, lang, "result.invalidSessionTitle", "result.invalidSessionMsg");
  serveTemplate(res, "connect-waba.html", {
    APP_ID: app.appId,
    CONFIG_ID: app.wabaConfigId,
    API_VERSION: app.apiVersion,
    STATE: String(req.query.state || ""),
    BRAND_NAME: htmlEscape(getBrand()),
    LANG: lang,
  });
});

app.get("/connect/messenger", (req: Request, res: Response) => {
  const { state, app } = appFromState(String(req.query.state || ""));
  const lang = langOf(req, state);
  if (!state || !app) return renderResultPage(res, false, lang, "result.invalidSessionTitle", "result.invalidSessionMsg");
  serveTemplate(res, "connect-messenger.html", {
    APP_ID: app.appId,
    CONFIG_ID: app.messengerConfigId,
    API_VERSION: app.apiVersion,
    STATE: String(req.query.state || ""),
    BRAND_NAME: htmlEscape(getBrand()),
    LANG: lang,
  });
});

app.get("/connect/instagram", (req: Request, res: Response) => {
  const { state, app } = appFromState(String(req.query.state || ""));
  const lang = langOf(req, state);
  if (!state || !app) return renderResultPage(res, false, lang, "result.invalidSessionTitle", "result.invalidSessionMsg");
  const ig = instagramCredsFor(app);
  if (!ig.id) return renderResultPage(res, false, lang, "result.appNotConfiguredTitle", "result.igAppNotConfigured");
  const scopes = ["instagram_business_basic", "instagram_business_manage_messages", "instagram_business_manage_comments"].join(",");
  const authUrl =
    "https://www.instagram.com/oauth/authorize" +
    `?client_id=${encodeURIComponent(ig.id)}` +
    `&redirect_uri=${encodeURIComponent(appRedirectUri())}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&state=${encodeURIComponent(String(req.query.state || ""))}`;
  serveTemplate(res, "connect-instagram.html", { AUTH_URL: authUrl, BRAND_NAME: htmlEscape(getBrand()), LANG: lang });
});

app.get("/connect/instagram/callback", async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query as Record<string, string>;
  const { state: decoded, app } = appFromState(String(state || ""));
  const lang = langOf(req, decoded);
  if (error) return renderResultPage(res, false, lang, "result.authDeniedTitle", "result.authDeniedMsg", { detail: error_description || error });
  if (!decoded || !app) return renderResultPage(res, false, lang, "result.invalidSessionTitle", "result.stateMissingMsg");
  if (!code) return renderResultPage(res, false, lang, "result.codeMissingTitle", "result.codeMissingMsg");

  const ig = instagramCredsFor(app);
  try {
    const result = await meta.exchangeInstagramCode(code, ig.id, ig.secret, appRedirectUri());
    if (result.error || !result.accessToken) {
      // Fallback: resolve IG Business accounts linked to the stored token's Pages.
      if (app.messengerFallbackToken) {
        const igs = await meta.getInstagramViaToken(app.messengerFallbackToken, app.apiVersion);
        if (igs.length) {
          for (const a of igs) {
            const s = await meta.subscribePageApp(a.page_id, a.page_token, app.apiVersion);
            store.upsertChannel({
              id: newId(),
              appId: app.id,
              type: "instagram",
              name: a.username,
              externalId: a.ig_id,
              accessToken: a.page_token,
              meta: { username: a.username, ig_user_id: a.ig_id, page_id: a.page_id, page_name: a.page_name, viaPage: true },
              subscribed: s.ok,
              subscribeError: s.ok ? null : s.error,
              createdAt: new Date().toISOString(),
              lastEventAt: null,
            });
          }
          console.log(`[connect/instagram] fallback token resolved ${igs.length} account(s) app=${app.id}`);
          const names = igs.map((a) => a.username).join(", ");
          return renderResultPage(res, true, lang, "result.igConnectedTitle", "result.igConnectedMsg", { username: names, app: app.name, sub: tServer(lang, "result.subOk") });
        }
      }
      return renderResultPage(res, false, lang, "result.tokenFailTitle", "result.tokenFailMsg");
    }
    const sub = await meta.subscribeInstagramApp(result.accessToken);
    store.upsertChannel({
      id: newId(),
      appId: app.id,
      type: "instagram",
      name: result.username,
      externalId: result.userId,
      accessToken: result.accessToken,
      meta: { username: result.username, ig_user_id: result.userId },
      subscribed: sub.ok,
      subscribeError: sub.ok ? null : sub.error,
      createdAt: new Date().toISOString(),
      lastEventAt: null,
    });
    console.log(`[connect/instagram] app=${app.id} ig_user_id=${result.userId} subscribed=${sub.ok}`);
    const subMsg = sub.ok ? tServer(lang, "result.subOk") : tServer(lang, "result.subFail", { err: sub.error || "" });
    return renderResultPage(res, true, lang, "result.igConnectedTitle", "result.igConnectedMsg", { username: result.username, app: app.name, sub: subMsg });
  } catch (err: any) {
    console.error("[connect/instagram] error:", err?.message || err);
    return renderResultPage(res, false, lang, "result.unexpectedTitle", "result.unexpectedMsg");
  }
});

app.post("/api/connect/waba/exchange", apiLimiter, async (req: Request, res: Response) => {
  const { state, code, waba_id, phone_number_id } = req.body as Record<string, any>;
  const { state: decoded, app } = appFromState(String(state || ""));
  if (!decoded || !app) return res.status(403).json({ error: "INVALID_STATE" });
  if (!code) return res.status(400).json({ error: "MISSING_CODE" });
  try {
    let token = await meta.exchangeCodeForToken(code, app.appId, app.appSecret, null, app.apiVersion);
    if (!token.access_token && req.body.redirectUri) {
      token = await meta.exchangeCodeForToken(code, app.appId, app.appSecret, String(req.body.redirectUri), app.apiVersion);
    }
    if (!token.access_token) return res.status(400).json({ error: token.error?.message || "token_exchange_failed" });
    if (!waba_id || !phone_number_id) {
      // Fallback: resolve WABAs + phone numbers from the stored advanced token.
      if (app.messengerFallbackToken) {
        const wabas = await meta.getWabasViaToken(app.messengerFallbackToken, app.appId, app.appSecret, app.apiVersion);
        if (wabas.length) {
          const connected: Array<{ phone_number_id: string; subscribed: boolean }> = [];
          for (const w of wabas) {
            const s = await meta.subscribeWabaApp(w.waba_id, app.messengerFallbackToken, app.apiVersion);
            store.upsertChannel({
              id: newId(),
              appId: app.id,
              type: "waba",
              name: `WhatsApp ${w.display || w.phone_number_id}`,
              externalId: w.phone_number_id,
              accessToken: app.messengerFallbackToken,
              meta: { waba_id: w.waba_id, phone_number_id: w.phone_number_id, display_phone_number: w.display, verified_name: w.name },
              subscribed: s.ok,
              subscribeError: s.ok ? null : s.error,
              createdAt: new Date().toISOString(),
              lastEventAt: null,
            });
            connected.push({ phone_number_id: w.phone_number_id, subscribed: s.ok });
          }
          console.log(`[connect/waba] fallback token resolved ${connected.length} number(s) app=${app.id}`);
          const name = wabas.length === 1 ? `WhatsApp ${wabas[0].display || wabas[0].phone_number_id}` : `${wabas.length} números`;
          return res.json({ ok: true, viaFallback: true, count: connected.length, subscribed: connected.every((c) => c.subscribed), name });
        }
      }
      return res.status(400).json({ error: "MISSING_IDS", message: "WABA não retornou waba_id/phone_number_id. Conclua o Embedded Signup escolhendo um número." });
    }
    const sub = await meta.subscribeWabaApp(String(waba_id), token.access_token, app.apiVersion);
    store.upsertChannel({
      id: newId(),
      appId: app.id,
      type: "waba",
      name: `WhatsApp ${phone_number_id}`,
      externalId: String(phone_number_id),
      accessToken: token.access_token,
      meta: { waba_id, phone_number_id },
      subscribed: sub.ok,
      subscribeError: sub.ok ? null : sub.error,
      createdAt: new Date().toISOString(),
      lastEventAt: null,
    });
    console.log(`[connect/waba] app=${app.id} phone_number_id=${phone_number_id} waba_id=${waba_id} subscribed=${sub.ok}`);
    res.json({ ok: true, subscribed: sub.ok, subscribeError: sub.error || null, name: `WhatsApp ${phone_number_id}` });
  } catch (err: any) {
    console.error("[connect/waba] error:", err?.message || err);
    res.status(500).json({ error: "server_error" });
  }
});

app.post("/api/connect/messenger/exchange", apiLimiter, async (req: Request, res: Response) => {
  const { state, code, userToken, redirectUri, configId } = req.body as Record<string, any>;
  const { state: decoded, app } = appFromState(String(state || ""));
  if (!decoded || !app) return res.status(403).json({ error: "INVALID_STATE" });
  try {
    let accessToken = "";
    if (code) {
      // Codes from FB.login (JS SDK, config_id + response_type=code) are exchanged
      // WITHOUT a redirect_uri — same as the WhatsApp Embedded Signup flow. Passing
      // the page URL causes "redirect_uri ... identical to the one in the OAuth dialog".
      let token = await meta.exchangeCodeForToken(code, app.appId, app.appSecret, null, app.apiVersion);
      if (!token.access_token && redirectUri && String(redirectUri).startsWith("https://")) {
        token = await meta.exchangeCodeForToken(code, app.appId, app.appSecret, String(redirectUri), app.apiVersion);
      }
      if (!token.access_token) return res.status(400).json({ error: token.error?.message || "token_exchange_failed" });
      accessToken = token.access_token;
    } else if (userToken) {
      accessToken = String(userToken);
    } else {
      return res.status(400).json({ error: "MISSING_CODE_OR_TOKEN" });
    }

    // List pages: try the code-exchanged token, then a long-lived one, then the
    // token's granular scopes (Login for Business often omits pages_show_list, so
    // /me/accounts is empty even after picking a Page), then Business Manager.
    let pages: meta.FbPage[] = [];
    let pagesErr: any;
    const r1 = await meta.getUserPages(accessToken, app.apiVersion);
    pages = r1.pages; pagesErr = r1.error;
    if (!pages.length) {
      const longToken = await meta.getLongLivedUserToken(accessToken, app.appId, app.appSecret, app.apiVersion);
      const r2 = await meta.getUserPages(longToken, app.apiVersion);
      if (r2.pages.length) { pages = r2.pages; } else { pagesErr = r2.error || pagesErr; }
      let pageScopeFound = false, wabaScopeFound = false, scopes: string[] = [], granular: string[] = [];
      if (!pages.length) {
        const gs = await meta.getPagesViaGranularScopes(longToken, app.appId, app.appSecret, app.apiVersion);
        pageScopeFound = gs.pageScopeFound; wabaScopeFound = gs.wabaScopeFound;
        scopes = gs.scopes; granular = gs.granularScopeNames;
        if (gs.pages.length) pages = gs.pages;
      }
      if (!pages.length) pages = await meta.getBusinessPages(longToken, app.apiVersion);
      // Fallback: a stored System/Page token (created in Business Manager) that
      // already holds Pages permissions — used when the OAuth flow returns none
      // (e.g. the Messenger config issues a WhatsApp system-user token).
      if (!pages.length && app.messengerFallbackToken) {
        const ft = app.messengerFallbackToken;
        console.log(`[connect/messenger] trying stored fallback token app=${app.id}`);
        const fr = await meta.getUserPages(ft, app.apiVersion);
        if (fr.pages.length) pages = fr.pages;
        if (!pages.length) {
          const fg = await meta.getPagesViaGranularScopes(ft, app.appId, app.appSecret, app.apiVersion);
          if (fg.pages.length) pages = fg.pages;
        }
        if (!pages.length) pages = await meta.getBusinessPages(ft, app.apiVersion);
        if (pages.length) console.log(`[connect/messenger] fallback token resolved ${pages.length} page(s) app=${app.id}`);
      }
      if (!pages.length) {
        let granted: string[] = [];
        try { granted = (await meta.getMePermissions(longToken, app.apiVersion)).granted; } catch {}
        // WhatsApp scopes + no Page scopes ⇒ a WhatsApp Embedded Signup config_id
        // was used for the Messenger flow; it can never return a Facebook Page.
        const wrongWaba = wabaScopeFound && !pageScopeFound;
        console.warn(
          `[connect/messenger] NO PAGES app=${app.id} configIdSent=${configId || "(none)"} ` +
          `messengerConfigId=${app.messengerConfigId || "(none)"} pageScope=${pageScopeFound} wabaScope=${wabaScopeFound} ` +
          `scopes=[${scopes.join(",")}] granular=[${granular.join(",")}] granted=[${granted.join(",")}] graphErr=${pagesErr?.message || "none"}`
        );
        return res.status(400).json({
          error: wrongWaba ? "WRONG_CONFIG_WABA" : "NO_PAGES",
          detail: granted.length ? "perms: " + granted.join(", ") : undefined,
          message: pagesErr?.message,
        });
      }
    }
    const connected: Array<{ id: string; name: string; subscribed: boolean; error?: string }> = [];
    for (const p of pages) {
      const sub = await meta.subscribePageApp(p.id, p.access_token, app.apiVersion);
      store.upsertChannel({
        id: newId(),
        appId: app.id,
        type: "messenger",
        name: p.name,
        externalId: String(p.id),
        accessToken: p.access_token,
        meta: { page_id: p.id, page_name: p.name },
        subscribed: sub.ok,
        subscribeError: sub.ok ? null : sub.error,
        createdAt: new Date().toISOString(),
        lastEventAt: null,
      });
      connected.push({ id: p.id, name: p.name, subscribed: sub.ok, error: sub.error });
    }
    console.log(`[connect/messenger] app=${app.id} connected ${connected.length} page(s)`);
    res.json({ ok: true, pages: connected });
  } catch (err: any) {
    console.error("[connect/messenger] error:", err?.message || err);
    res.status(500).json({ error: "server_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EMBED — public connect launcher (no admin auth). Gated by app.embedEnabled.
// Lets a connection button live OUTSIDE the panel (any website). It mints a
// signed state for app+channel and forwards to the normal connect page.
// ─────────────────────────────────────────────────────────────────────────────
app.get("/embed/connect", apiLimiter, (req: Request, res: Response) => {
  const appId = String(req.query.app || "");
  const channel = String(req.query.channel || "") as ChannelType;
  const lang = normalizeLang(req.query.lang as string);
  const appCfg = store.findApp(appId);
  if (!appCfg || !appCfg.embedEnabled) {
    return renderResultPage(res, false, lang, "result.unavailableTitle", "result.unavailableMsg");
  }
  if (!["waba", "messenger", "instagram"].includes(channel)) {
    return renderResultPage(res, false, lang, "result.invalidChannelTitle", "result.invalidChannelMsg");
  }
  if (!appCfg.appId || !appCfg.appSecret) {
    return renderResultPage(res, false, lang, "result.appNotConfiguredTitle", "result.appNoSecretMsg");
  }
  const state = encodeState(channel, appId, lang);
  return res.redirect(`${PUBLIC_URL}/connect/${channel}?state=${encodeURIComponent(state)}&lang=${lang}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOKS — per-app verify + receive, then route (forward) per-app.
// ─────────────────────────────────────────────────────────────────────────────
function relayToApp(appCfg: MetaApp, product: ChannelType | "unknown", rawBody: string | undefined, sigHeader: string | undefined, eventId: string | null): number {
  const dests = (appCfg.forwards || []).filter(
    (f) => f.enabled && (f.products.includes("all") || (product !== "unknown" && f.products.includes(product)))
  );
  if (!dests.length) return 0;
  // eventId is null in relay-only mode (no history): we still forward, just skip event bookkeeping.
  if (eventId) store.updateEvent(eventId, { forwards: dests.map((d) => ({ url: d.url, ok: false, status: "pending" })) });
  for (const d of dests) {
    setImmediate(async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FORWARD_TIMEOUT_MS);
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json", "X-Hub-App": appCfg.id };
        if (sigHeader) headers["X-Hub-Signature-256"] = sigHeader;
        const r = await fetch(d.url, { method: "POST", headers, body: rawBody || "{}", signal: ctrl.signal });
        if (eventId) store.setEventForward(eventId, d.url, r.ok, r.status);
        if (WEBHOOK_DEBUG_LOG) console.log(`[forward] app=${appCfg.id} → ${d.url} status=${r.status}`);
      } catch (err: any) {
        const status = err?.name === "AbortError" ? "timeout" : "error";
        if (eventId) store.setEventForward(eventId, d.url, false, status);
        if (WEBHOOK_DEBUG_LOG) console.log(`[forward] app=${appCfg.id} → ${d.url} FAILED ${status}`);
      } finally {
        clearTimeout(timer);
      }
    });
  }
  return dests.length;
}

/** Core ingest: parse, verify signature, store event, forward. `appCfg` may be
 *  null on the generic endpoint (then we try to resolve it). */
function ingest(appCfg: MetaApp | null, req: Request): void {
  const body = req.body;
  const rawBody = (req as any).rawBody as string | undefined;
  const sig = (req.headers["x-hub-signature-256"] as string) || undefined;
  const parsed = parseWebhook(body);

  let resolved = appCfg;
  if (!resolved) {
    const apps = store.listApps();
    if (apps.length === 1) resolved = apps[0];
    else if (parsed.externalId) {
      const ch = store.findChannelByExternalId(parsed.externalId);
      if (ch) resolved = store.findApp(ch.appId) || null;
    }
  }

  // Instagram Login webhooks are signed with the Instagram app secret (when the
  // app uses a separate IG app); page-linked/other products use the main secret.
  // Accept the event if EITHER secret validates.
  let signatureValid: boolean | null = null;
  if (resolved) {
    signatureValid = verifyWebhookSignature(rawBody, sig, resolved.appSecret);
    if (!signatureValid && parsed.product === "instagram" && resolved.instagramAppSecret) {
      signatureValid = verifyWebhookSignature(rawBody, sig, resolved.instagramAppSecret);
    }
  }
  const matched = parsed.externalId ? store.findChannelByExternalId(parsed.externalId) : undefined;
  if (parsed.externalId) store.touchChannelEvent(parsed.externalId);

  const ev: WebhookEvent = {
    id: newId(),
    ts: new Date().toISOString(),
    appId: resolved?.id || null,
    appName: resolved?.name || "(não identificado)",
    product: parsed.product,
    externalId: parsed.externalId,
    channelId: matched?.id || null,
    kind: parsed.kind,
    direction: "in",
    summary: parsed.summary,
    signatureValid,
    forwards: [],
    raw: body,
  };
  // storeEvents=false → relay-only ("transacional"): forward without keeping history.
  // Unidentified apps (resolved=null) are always stored so nothing is silently dropped.
  const keepHistory = !resolved || resolved.storeEvents !== false;
  if (keepHistory) store.addEvent(ev);
  if (resolved) {
    const eventId = keepHistory ? ev.id : null;
    // Aviso de lead (Lead Ads): vai só pro sistema dono da Página. Página sem dono
    // (ou aviso que não é de lead) segue o repasse normal do app.
    const lead = signatureValid ? leads.entregarLeadgen(resolved.id, body, rawBody, sig, eventId) : { leadgen: false, semDono: false };
    if (!lead.leadgen || lead.semDono) relayToApp(resolved, parsed.product, rawBody, sig, lead.leadgen ? null : eventId);
  }

  if (WEBHOOK_DEBUG_LOG) {
    console.log(`[webhook] app=${resolved?.id || "?"} product=${parsed.product} ext=${parsed.externalId} sig=${signatureValid} store=${keepHistory}`);
  }
}

// Per-app endpoints (primary).
function verifyForApp(appCfg: MetaApp | undefined, req: Request, res: Response): void {
  if (!appCfg) {
    res.sendStatus(404);
    return;
  }
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && challenge && token && token === appCfg.webhookVerifyToken) {
    console.log(`[webhook] verify ok app=${appCfg.id}`);
    res.status(200).send(String(challenge));
    return;
  }
  res.sendStatus(403);
}

app.get("/webhook/app/:appKey", webhookLimiter, (req, res) => verifyForApp(store.findApp(req.params.appKey), req, res));
app.get("/webhook/app/:appKey/:product", webhookLimiter, (req, res) => verifyForApp(store.findApp(req.params.appKey), req, res));
app.post("/webhook/app/:appKey", webhookLimiter, (req, res) => {
  const appCfg = store.findApp(req.params.appKey);
  res.sendStatus(appCfg ? 200 : 404);
  if (appCfg) ingest(appCfg, req);
});
app.post("/webhook/app/:appKey/:product", webhookLimiter, (req, res) => {
  const appCfg = store.findApp(req.params.appKey);
  res.sendStatus(appCfg ? 200 : 404);
  if (appCfg) ingest(appCfg, req);
});

// Generic endpoint (fallback) — resolves the app by signature-less heuristics.
function verifyGeneric(req: Request, res: Response): void {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && challenge && token && store.listApps().some((a) => a.webhookVerifyToken && a.webhookVerifyToken === token)) {
    res.status(200).send(String(challenge));
    return;
  }
  res.sendStatus(403);
}
app.get("/webhook", webhookLimiter, verifyGeneric);
app.get("/webhook/:product", webhookLimiter, verifyGeneric);
app.post("/webhook", webhookLimiter, (req, res) => {
  res.sendStatus(200);
  ingest(null, req);
});
app.post("/webhook/:product", webhookLimiter, (req, res) => {
  res.sendStatus(200);
  ingest(null, req);
});

// ─────────────────────────────────────────────────────────────────────────────
// Health + static panel
// ─────────────────────────────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", uptime: process.uptime(), apps: store.listApps().length, channels: store.listChannels().length });
});

// i18n dictionary for the browser (single source of truth = locales/*.json).
app.get("/i18n-data.js", (_req: Request, res: Response) => {
  reloadLocales(); // re-read locales/*.json so key edits show on refresh (no restart)
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.send(localesScript());
});

// Páginas legais (exigidas pela Meta: política de privacidade, termos, exclusão
// de dados). Servidas em URLs limpas a partir de public/legal/.
const LEGAL_DIR = path.join(__dirname, "..", "public", "legal");
app.get("/privacidade", (_req, res) => res.sendFile(path.join(LEGAL_DIR, "privacidade.html")));
app.get("/termos", (_req, res) => res.sendFile(path.join(LEGAL_DIR, "termos.html")));
app.get("/exclusao-de-dados", (_req, res) => res.sendFile(path.join(LEGAL_DIR, "exclusao-de-dados.html")));

app.use(express.static(path.join(__dirname, "..", "public")));
app.get("/", (_req: Request, res: Response) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));
app.use("/api", (_req: Request, res: Response) => res.status(404).json({ error: "NOT_FOUND" }));

seedAppFromEnvIfEmpty(() => newId().slice(0, 10));

const server = app.listen(PORT, () => {
  console.log(`\n  ${getBrand()} — oauth-hub (multi-app)`);
  console.log(`  listening on :${PORT}`);
  console.log(`  public url:  ${PUBLIC_URL}`);
  console.log(`  admin auth:  ${ADMIN_PASSWORD ? "ON" : "OFF (open mode — set ADMIN_PASSWORD)"}`);
  console.log(`  apps:        ${store.listApps().length} registered`);
  console.log(`  per-app webhook: ${PUBLIC_URL}/webhook/app/<appKey>\n`);
});

attachTerminal(server, !!ADMIN_PASSWORD);
