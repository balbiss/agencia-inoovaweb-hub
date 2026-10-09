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
// Tiny file-backed JSON stores (no database dependency).
// Atomic writes via temp file + rename; debounced async save.
// Stores: settings (global), apps (multi-app), channels, events.
// ─────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { Channel, MetaApp, WebhookEvent } from "./types";

export const DATA_DIR = path.join(__dirname, "..", "data");

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    const full = path.join(DATA_DIR, file);
    if (!fs.existsSync(full)) return fallback;
    return JSON.parse(fs.readFileSync(full, "utf-8")) as T;
  } catch (err) {
    console.error(`[store] could not read ${file}:`, err);
    return fallback;
  }
}

const timers: Record<string, NodeJS.Timeout> = {};
export function writeJson(file: string, data: unknown, debounceMs = 300): void {
  if (timers[file]) clearTimeout(timers[file]);
  timers[file] = setTimeout(() => {
    try {
      ensureDir();
      const full = path.join(DATA_DIR, file);
      const tmp = full + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
      fs.renameSync(tmp, full);
    } catch (err) {
      console.error(`[store] could not write ${file}:`, err);
    }
  }, debounceMs);
}

// ─── Settings (global, non-app) ───────────────────────────────────────────────

interface GlobalSettings { brandName?: string; updatedAt?: string }
let settingsCache: GlobalSettings = readJson<GlobalSettings>("settings.json", {});

export function getSettings(): GlobalSettings {
  return settingsCache;
}
export function saveSettings(next: GlobalSettings): GlobalSettings {
  settingsCache = { ...settingsCache, ...next, updatedAt: new Date().toISOString() };
  writeJson("settings.json", settingsCache, 0);
  return settingsCache;
}

// ─── Apps ─────────────────────────────────────────────────────────────────────

let apps: MetaApp[] = readJson<MetaApp[]>("apps.json", []);

export function listApps(): MetaApp[] {
  return apps;
}
export function findApp(id: string): MetaApp | undefined {
  return apps.find((a) => a.id === id);
}
export function addApp(app: MetaApp): MetaApp {
  apps.push(app);
  writeJson("apps.json", apps, 0);
  return app;
}
export function updateApp(id: string, patch: Partial<MetaApp>): MetaApp | undefined {
  const a = findApp(id);
  if (!a) return undefined;
  Object.assign(a, patch, { id: a.id, createdAt: a.createdAt, updatedAt: new Date().toISOString() });
  writeJson("apps.json", apps, 0);
  return a;
}
export function deleteApp(id: string): boolean {
  const idx = apps.findIndex((a) => a.id === id);
  if (idx < 0) return false;
  apps.splice(idx, 1);
  writeJson("apps.json", apps, 0);
  return true;
}

// ─── Channels ─────────────────────────────────────────────────────────────────

let channels: Channel[] = readJson<Channel[]>("channels.json", []);

export function listChannels(): Channel[] {
  return channels;
}
export function findChannelByExternalId(externalId: string): Channel | undefined {
  return channels.find((c) => c.externalId === externalId);
}
export function findChannelById(id: string): Channel | undefined {
  return channels.find((c) => c.id === id);
}
export function countChannelsByApp(appId: string): number {
  return channels.filter((c) => c.appId === appId).length;
}
export function upsertChannel(ch: Channel): Channel {
  const idx = channels.findIndex((c) => c.externalId === ch.externalId && c.type === ch.type);
  if (idx >= 0) {
    channels[idx] = { ...channels[idx], ...ch, id: channels[idx].id, createdAt: channels[idx].createdAt };
  } else {
    channels.push(ch);
  }
  writeJson("channels.json", channels);
  return channels.find((c) => c.externalId === ch.externalId && c.type === ch.type)!;
}
export function deleteChannel(id: string): Channel | undefined {
  const idx = channels.findIndex((c) => c.id === id);
  if (idx < 0) return undefined;
  const [removed] = channels.splice(idx, 1);
  writeJson("channels.json", channels);
  return removed;
}
export function touchChannelEvent(externalId: string): Channel | undefined {
  const ch = findChannelByExternalId(externalId);
  if (ch) {
    ch.lastEventAt = new Date().toISOString();
    writeJson("channels.json", channels);
  }
  return ch;
}

// ─── Events (ring buffer) ──────────────────────────────────────────────────────

const EVENTS_MAX = Math.max(50, Number(process.env.WEBHOOK_EVENTS_MAX) || 500);
let events: WebhookEvent[] = readJson<WebhookEvent[]>("events.json", []).slice(-EVENTS_MAX);

export function addEvent(ev: WebhookEvent): void {
  events.push(ev);
  if (events.length > EVENTS_MAX) events = events.slice(-EVENTS_MAX);
  writeJson("events.json", events);
}
export function updateEvent(id: string, patch: Partial<WebhookEvent>): void {
  const ev = events.find((e) => e.id === id);
  if (!ev) return;
  Object.assign(ev, patch);
  writeJson("events.json", events);
}
/** Append pending forward entries to an event (several relays may target the same event). */
export function addEventForwards(id: string, urls: string[]): void {
  const ev = events.find((e) => e.id === id);
  if (!ev) return;
  ev.forwards = [...(ev.forwards || []), ...urls.map((url) => ({ url, ok: false, status: "pending" as const }))];
  writeJson("events.json", events);
}
/** Update one forward-result entry of an event (used as async relays complete). */
export function setEventForward(eventId: string, url: string, ok: boolean, status: number | string): void {
  const ev = events.find((e) => e.id === eventId);
  if (!ev) return;
  const f = ev.forwards.find((x) => x.url === url && x.status === "pending") || ev.forwards.find((x) => x.url === url);
  if (f) {
    f.ok = ok;
    f.status = status;
    writeJson("events.json", events);
  }
}
export function listEvents(sinceTs?: string, limit = 100): WebhookEvent[] {
  let out = events;
  if (sinceTs) out = out.filter((e) => e.ts > sinceTs);
  return out.slice(-limit).reverse();
}
export function clearEvents(): void {
  events = [];
  writeJson("events.json", events, 0);
}

/** Aggregate counts for the overview cards. */
export function eventStats(): { total: number; lastHour: number; forwardsLastHour: number } {
  const hourAgo = Date.now() - 3600_000;
  let lastHour = 0;
  let forwardsLastHour = 0;
  for (const e of events) {
    const t = Date.parse(e.ts);
    if (!isNaN(t) && t >= hourAgo) {
      lastHour++;
      forwardsLastHour += e.forwards ? e.forwards.length : 0;
    }
  }
  return { total: events.length, lastHour, forwardsLastHour };
}
