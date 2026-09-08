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
// Global configuration + per-app helpers (multi-app).
// App credentials live in the apps store; this module resolves global bits
// (brand, public URL, secrets) and computes per-app webhook/redirect URLs.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getSettings, listApps, addApp, DATA_DIR } from "./store";
import { MetaApp, MetaAppPublic } from "./types";
import * as store from "./store";

function env(name: string): string {
  return (process.env[name] || "").trim();
}

export const PORT = Number(env("PORT")) || 3300;
export const PUBLIC_URL = (env("PUBLIC_URL") || `http://localhost:${PORT}`).replace(/\/$/, "");
export const ADMIN_PASSWORD = env("ADMIN_PASSWORD");
export const WEBHOOK_DEBUG_LOG = /^(1|true|yes|on)$/i.test(env("WEBHOOK_DEBUG_LOG"));
export const DEFAULT_API_VERSION = env("META_API_VERSION") || "v23.0";
export const FORWARD_TIMEOUT_MS = Math.max(2000, Number(env("FORWARD_TIMEOUT_MS")) || 10000);

// AGPL-3.0 §13: remote users must be able to obtain the Corresponding Source.
// Shown as a "Source" link in the panel footer. Override via env if you fork.
export const SOURCE_URL = (env("SOURCE_URL") || "https://github.com/balbiss/agencia-inoovaweb-hub").replace(/\/$/, "");

export const SESSION_SECRET = (() => {
  const fromEnv = env("SESSION_SECRET");
  if (fromEnv) return fromEnv;
  // No env secret: persist a generated one to disk so panel sessions and
  // in-flight OAuth states survive restarts (otherwise every restart yields a
  // new secret and breaks them → INVALID_STATE mid-connect).
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const file = path.join(DATA_DIR, ".session-secret");
    if (fs.existsSync(file)) {
      const saved = fs.readFileSync(file, "utf-8").trim();
      if (saved) return saved;
    }
    const gen = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(file, gen, { encoding: "utf-8", mode: 0o600 });
    console.warn(
      "[config] SESSION_SECRET not set — generated and persisted one at data/.session-secret. " +
        "Set SESSION_SECRET in the environment to control it in production."
    );
    return gen;
  } catch (e) {
    console.warn(
      "[config] SESSION_SECRET not set and could not persist a generated one; " +
        "falling back to an ephemeral secret (breaks sessions/OAuth on restart).",
      e
    );
    return crypto.randomBytes(32).toString("hex");
  }
})();

export function getBrand(): string {
  return getSettings().brandName || env("BRAND_NAME") || "InoovaWeb — Hub de Canais";
}

// ─── Per-app derived values ────────────────────────────────────────────────────

export function appWebhookUrls(appId: string) {
  const base = `${PUBLIC_URL}/webhook/app/${appId}`;
  return { unified: base, waba: `${base}/waba`, messenger: `${base}/messenger`, instagram: `${base}/instagram` };
}

export function appRedirectUri(): string {
  // Instagram redirect_uri is app-agnostic (the app is carried in the signed state).
  return `${PUBLIC_URL}/connect/instagram/callback`;
}

export function instagramCredsFor(app: MetaApp): { id: string; secret: string } {
  return {
    id: app.instagramAppId || app.appId,
    secret: app.instagramAppSecret || app.appSecret,
  };
}

export function toPublicApp(app: MetaApp): MetaAppPublic {
  const ig = instagramCredsFor(app);
  return {
    id: app.id,
    name: app.name,
    appId: app.appId,
    apiVersion: app.apiVersion,
    wabaConfigId: app.wabaConfigId,
    messengerConfigId: app.messengerConfigId,
    instagramAppId: ig.id,
    hasAppSecret: !!app.appSecret,
    hasInstagramAppSecret: !!app.instagramAppSecret,
    hasMessengerFallbackToken: !!app.messengerFallbackToken,
    webhookVerifyTokenSet: !!app.webhookVerifyToken,
    forwards: app.forwards || [],
    storeEvents: app.storeEvents !== false,
    embedEnabled: app.embedEnabled === true,
    channelCount: store.countChannelsByApp(app.id),
    createdAt: app.createdAt,
    webhookUrls: appWebhookUrls(app.id),
    redirectUri: appRedirectUri(),
  };
}

export function getGlobalPublicConfig() {
  return {
    brandName: getBrand(),
    publicUrl: PUBLIC_URL,
    apiVersionDefault: DEFAULT_API_VERSION,
    adminAuthEnabled: !!ADMIN_PASSWORD,
    sourceUrl: SOURCE_URL,
  };
}

/**
 * Seed a single app from environment variables on first boot (headless deploys).
 * Only runs when no apps exist yet AND META_APP_ID is provided.
 */
export function seedAppFromEnvIfEmpty(makeId: () => string): void {
  if (listApps().length > 0) return;
  const appId = env("META_APP_ID");
  if (!appId) return;
  const now = new Date().toISOString();
  addApp({
    id: makeId(),
    name: env("META_APP_NAME") || "App principal",
    appId,
    appSecret: env("META_APP_SECRET"),
    apiVersion: DEFAULT_API_VERSION,
    wabaConfigId: env("META_WABA_CONFIG_ID"),
    messengerConfigId: env("META_MESSENGER_CONFIG_ID"),
    instagramAppId: env("INSTAGRAM_APP_ID"),
    instagramAppSecret: env("INSTAGRAM_APP_SECRET"),
    messengerFallbackToken: env("META_MESSENGER_FALLBACK_TOKEN"),
    webhookVerifyToken: env("WEBHOOK_VERIFY_TOKEN"),
    forwards: [],
    storeEvents: true,
    embedEnabled: false,
    createdAt: now,
  });
  console.log("[config] seeded app from environment (META_APP_ID present, no apps existed).");
}
