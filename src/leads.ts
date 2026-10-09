// ─────────────────────────────────────────────────────────────────────────────
// Roteamento de leads do Facebook (Lead Ads) por Página — InoovaWeb.
//
// A Meta só aceita UM webhook por app. Vários sistemas (CRMs) usam o mesmo app
// (ex.: "Conecta Leads InoovaWeb"), então o hub vira o carteiro:
//   • cada sistema é um "cliente de leads" (nome + URL de entrega + chave de API);
//   • o sistema registra as Páginas que conectou (POST /api/leads/pages);
//   • uma Página tem UM dono só — outro sistema que tente registrar leva 409;
//   • aviso `leadgen` chega → vai SÓ pro sistema dono da Página, com o corpo e a
//     assinatura originais da Meta (o sistema confere com o App Secret);
//   • Página sem dono segue o repasse normal do app (destinos do painel).
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "crypto";
import { Router, Request, Response, NextFunction } from "express";
import * as store from "./store";
import { FORWARD_TIMEOUT_MS, WEBHOOK_DEBUG_LOG } from "./config";
import { requireAdmin, newId } from "./security";

export interface LeadClient {
  id: string;
  appKey: string;   // app do hub (MetaApp.id) cujos avisos esse sistema recebe
  name: string;     // ex.: "Visita IA CRM v2"
  url: string;      // onde o hub entrega o aviso leadgen
  apiKey: string;   // server-only; o sistema manda em `x-hub-key`
  createdAt: string;
}

export interface LeadRoute {
  pageId: string;
  pageName: string;
  clientId: string;
  ref: string;      // referência livre do sistema (ex.: id da imobiliária)
  createdAt: string;
  updatedAt?: string;
}

let clients: LeadClient[] = store.readJson<LeadClient[]>("lead-clients.json", []);
let routes: LeadRoute[] = store.readJson<LeadRoute[]>("lead-routes.json", []);
const saveClients = () => store.writeJson("lead-clients.json", clients, 0);
const saveRoutes = () => store.writeJson("lead-routes.json", routes, 0);

const publicClient = (c: LeadClient) => ({
  id: c.id, appKey: c.appKey, name: c.name, url: c.url, createdAt: c.createdAt,
  apiKeyHint: "••••" + c.apiKey.slice(-4),
  pages: routes.filter((r) => r.clientId === c.id).length,
});

// ─── Entrega dos avisos ──────────────────────────────────────────────────────

/** Páginas citadas num aviso `leadgen` (object=page). null = não é aviso de lead. */
function paginasDoLeadgen(body: any): string[] | null {
  if (body?.object !== "page" || !Array.isArray(body.entry)) return null;
  const ids = new Set<string>();
  for (const e of body.entry) {
    for (const ch of e?.changes || []) {
      if (ch?.field === "leadgen") ids.add(String(ch.value?.page_id || e.id));
    }
  }
  return ids.size ? [...ids] : null;
}

/** Entrega um aviso leadgen aos donos das Páginas. Devolve `true` quando alguma
 *  Página não tem dono (aí o chamador segue com o repasse normal do app). */
export function entregarLeadgen(appKey: string, body: any, rawBody: string | undefined, sig: string | undefined, eventId: string | null): { leadgen: boolean; semDono: boolean } {
  const paginas = paginasDoLeadgen(body);
  if (!paginas) return { leadgen: false, semDono: false };
  const destinos = new Map<string, LeadClient>();
  let semDono = false;
  for (const pageId of paginas) {
    const r = routes.find((x) => x.pageId === pageId);
    const c = r && clients.find((x) => x.id === r.clientId && x.appKey === appKey);
    if (c) destinos.set(c.id, c);
    else semDono = true;
  }
  if (destinos.size && eventId) {
    store.addEventForwards(eventId, [...destinos.values()].map((c) => c.url));
  }
  for (const c of destinos.values()) {
    setImmediate(async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FORWARD_TIMEOUT_MS);
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json", "X-Hub-App": appKey, "X-Hub-Client": c.id };
        if (sig) headers["X-Hub-Signature-256"] = sig;
        const r = await fetch(c.url, { method: "POST", headers, body: rawBody || "{}", signal: ctrl.signal });
        if (eventId) store.setEventForward(eventId, c.url, r.ok, r.status);
        if (WEBHOOK_DEBUG_LOG) console.log(`[leads] ${appKey} → ${c.name} status=${r.status}`);
      } catch (err: any) {
        const status = err?.name === "AbortError" ? "timeout" : "error";
        if (eventId) store.setEventForward(eventId, c.url, false, status);
        console.log(`[leads] ${appKey} → ${c.name} FALHOU ${status}`);
      } finally {
        clearTimeout(timer);
      }
    });
  }
  return { leadgen: true, semDono };
}

// ─── API ─────────────────────────────────────────────────────────────────────

function chaveIgual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function requireLeadClient(req: Request, res: Response, next: NextFunction): void {
  const key = String(req.header("x-hub-key") || "");
  const c = key ? clients.find((x) => chaveIgual(x.apiKey, key)) : undefined;
  if (!c) { res.status(401).json({ error: "Chave do hub inválida" }); return; }
  (req as any).leadClient = c;
  next();
}

// https obrigatório (http só pra localhost, em desenvolvimento).
const urlValida = (u: unknown) => typeof u === "string" && /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:/])\S+$/i.test(u.trim());

export function leadsRouter(): Router {
  const r = Router();

  // ── Painel (admin): sistemas e mapa de páginas ──
  r.get("/api/lead-clients", requireAdmin, (_req, res) => res.json(clients.map(publicClient)));

  r.post("/api/lead-clients", requireAdmin, (req, res) => {
    const { appKey, name, url } = req.body || {};
    if (!appKey || !store.findApp(String(appKey))) return res.status(400).json({ error: "App do hub não encontrado" });
    if (!name || !String(name).trim()) return res.status(400).json({ error: "Informe o nome do sistema" });
    if (!urlValida(url)) return res.status(400).json({ error: "URL de entrega precisa ser https://" });
    const c: LeadClient = {
      id: newId(), appKey: String(appKey), name: String(name).trim(), url: String(url).trim(),
      apiKey: crypto.randomBytes(24).toString("hex"), createdAt: new Date().toISOString(),
    };
    clients.push(c);
    saveClients();
    // A chave aparece UMA vez só (depois só os 4 últimos dígitos).
    res.status(201).json({ ...publicClient(c), apiKey: c.apiKey });
  });

  r.put("/api/lead-clients/:id", requireAdmin, (req, res) => {
    const c = clients.find((x) => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: "Sistema não encontrado" });
    const { name, url } = req.body || {};
    if (name !== undefined && String(name).trim()) c.name = String(name).trim();
    if (url !== undefined) {
      if (!urlValida(url)) return res.status(400).json({ error: "URL de entrega precisa ser https://" });
      c.url = String(url).trim();
    }
    saveClients();
    res.json(publicClient(c));
  });

  r.delete("/api/lead-clients/:id", requireAdmin, (req, res) => {
    const idx = clients.findIndex((x) => x.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: "Sistema não encontrado" });
    clients.splice(idx, 1);
    routes = routes.filter((x) => x.clientId !== req.params.id);
    saveClients(); saveRoutes();
    res.json({ ok: true });
  });

  r.get("/api/lead-routes", requireAdmin, (_req, res) => {
    res.json(routes.map((x) => ({ ...x, clientName: clients.find((c) => c.id === x.clientId)?.name || "(removido)" })));
  });

  r.delete("/api/lead-routes/:pageId", requireAdmin, (req, res) => {
    const antes = routes.length;
    routes = routes.filter((x) => x.pageId !== req.params.pageId);
    saveRoutes();
    res.json({ ok: routes.length < antes });
  });

  // ── Sistemas (x-hub-key): registrar / liberar as próprias Páginas ──
  r.get("/api/leads/pages", requireLeadClient, (req, res) => {
    const c: LeadClient = (req as any).leadClient;
    res.json(routes.filter((x) => x.clientId === c.id));
  });

  r.post("/api/leads/pages", requireLeadClient, (req, res) => {
    const c: LeadClient = (req as any).leadClient;
    const pageId = String(req.body?.pageId || "").trim();
    if (!/^\d{5,25}$/.test(pageId)) return res.status(400).json({ error: "pageId inválido" });
    const pageName = String(req.body?.pageName || "").trim().slice(0, 120);
    const ref = String(req.body?.ref || "").trim().slice(0, 120);
    const atual = routes.find((x) => x.pageId === pageId);
    if (atual && atual.clientId !== c.id) {
      return res.status(409).json({ error: "Essa página já está conectada em outro sistema" });
    }
    const agora = new Date().toISOString();
    if (atual) Object.assign(atual, { pageName: pageName || atual.pageName, ref, updatedAt: agora });
    else routes.push({ pageId, pageName, clientId: c.id, ref, createdAt: agora });
    saveRoutes();
    res.status(atual ? 200 : 201).json({ ok: true });
  });

  r.delete("/api/leads/pages/:pageId", requireLeadClient, (req, res) => {
    const c: LeadClient = (req as any).leadClient;
    const atual = routes.find((x) => x.pageId === req.params.pageId);
    if (!atual) return res.json({ ok: true });
    if (atual.clientId !== c.id) return res.status(403).json({ error: "Essa página é de outro sistema" });
    routes = routes.filter((x) => x !== atual);
    saveRoutes();
    res.json({ ok: true });
  });

  return r;
}
