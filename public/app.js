/* oauth-hub panel — "Mission Control" (multi-app, i18n, live console). Vanilla JS. */
(function () {
  "use strict";

  var TOKEN_KEY = "hub_token";
  var token = localStorage.getItem(TOKEN_KEY) || "";
  var lastEventTs = "";
  var eventsTimer = null;
  var appsCache = [];
  var statsCache = null;
  var publicUrl = "";
  var liveOn = true;
  var soundOn = false;
  try { soundOn = localStorage.getItem("hub_sound") === "1"; } catch (e) {}

  var SITE_URL = "https://inoovaweb.com.br";
  var TABS = ["overview", "events", "channels", "apps", "config", "guide", "evidence", "terminal"];

  function $(id) { return document.getElementById(id); }
  function show(el) { el && el.classList.remove("hidden"); }
  function hide(el) { el && el.classList.add("hidden"); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function escAttr(s) { return esc(s).replace(/"/g, "&quot;"); }
  function t(k, v) { return window.I18N ? window.I18N.t(k, v) : k; }
  function hasKey(k) { return window.I18N && window.I18N.t(k) !== k; }

  var CH_NAME = { waba: "WhatsApp", messenger: "Messenger", instagram: "Instagram" };
  function chName(p) { return CH_NAME[p] || p; }
  function prodLabel(p) { return p === "all" ? t("form.prodAll") : chName(p); }

  // ── Lucide icons (inline SVG) ──────────────────────────────
  var ICONS = {
    plug: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
    grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    dash: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    moon: '<path d="M12 3a6.4 6.4 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    sliders: '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="8" y2="8"/><line x1="17" x2="23" y1="16" y2="16"/>',
    trendUp: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    sound: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    soundOff: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    youtube: '<path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/>'
  };
  function icon(name) { return '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || "") + "</svg>"; }

  var toastTimer = null;
  function toast(msg, isError) {
    var el = $("toast"); if (!el) return;
    el.innerHTML = icon(isError ? "alert" : "check") + "<span></span>";
    el.querySelector("span").textContent = msg;
    el.className = "toast show " + (isError ? "error" : "ok");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = "toast"; }, 3200);
  }

  function translateErr(data) {
    if (!data) return t("err.generic");
    if (data.error) {
      var k = "err." + data.error;
      var base = hasKey(k) ? t(k) : (data.message || data.error);
      return data.detail ? (base + " — " + data.detail) : base;
    }
    return data.message || t("err.generic");
  }

  // Custom confirmation popup (no native alert/confirm). Returns Promise<boolean>.
  function confirmModal(message, confirmLabel, danger) {
    return new Promise(function (resolve) {
      var prevFocus = document.activeElement;
      var ov = document.createElement("div");
      ov.className = "modal-overlay";
      ov.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true">' +
          '<div class="modal-msg">' + esc(message) + "</div>" +
          '<div class="modal-actions">' +
            '<button class="btn ghost" data-c="0">' + esc(t("form.cancel")) + "</button>" +
            '<button class="btn ' + (danger ? "danger" : "") + '" data-c="1">' + esc(confirmLabel || t("form.create")) + "</button>" +
          "</div>" +
        "</div>";
      document.body.appendChild(ov);
      function done(v) { document.removeEventListener("keydown", onKey); ov.remove(); if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) {} } resolve(v); }
      function onKey(e) { if (e.key === "Escape") done(false); }
      ov.addEventListener("click", function (e) {
        if (e.target === ov) return done(false);
        var b = e.target.closest("[data-c]");
        if (b) done(b.getAttribute("data-c") === "1");
      });
      document.addEventListener("keydown", onKey);
      var cb = ov.querySelector('[data-c="1"]'); if (cb) cb.focus();
    });
  }

  // ── Time + format ──────────────────────────────────────────
  function timeAgo(iso) {
    if (!iso) return "";
    var d = Date.parse(iso); if (isNaN(d)) return "";
    var s = Math.floor((Date.now() - d) / 1000);
    if (s < 5) return t("time.now");
    if (s < 60) return t("time.s", { n: s });
    var m = Math.floor(s / 60); if (m < 60) return t("time.m", { n: m });
    var h = Math.floor(m / 60); if (h < 24) return t("time.h", { n: h });
    return t("time.d", { n: Math.floor(h / 24) });
  }
  function fmtAbs(iso) { try { return new Date(iso).toLocaleString(); } catch (e) { return ""; } }

  function skeletonRows(n) {
    var out = "";
    for (var i = 0; i < (n || 3); i++) out += '<div class="skel-row"><div class="skel skel-line" style="width:' + (45 + (i * 13) % 40) + '%"></div><div class="skel skel-line short"></div></div>';
    return out;
  }
  function emptyState(name, title, sub) {
    return '<div class="empty"><div class="empty-ico">' + icon(name) + "</div>" + esc(title) + (sub ? '<br><span class="empty-sub">' + esc(sub) + "</span>" : "") + "</div>";
  }

  // ── SVG charts (no deps) ───────────────────────────────────
  function bucketEvents(events, windowMin, buckets) {
    var now = Date.now();
    var arr = new Array(buckets); for (var k = 0; k < buckets; k++) arr[k] = 0;
    var binMs = (windowMin * 60000) / buckets;
    for (var i = 0; i < events.length; i++) {
      var ts = Date.parse(events[i].ts); if (isNaN(ts)) continue;
      var ago = now - ts; if (ago < 0) ago = 0;
      if (ago < windowMin * 60000) {
        var idx = buckets - 1 - Math.floor(ago / binMs);
        if (idx < 0) idx = 0; if (idx > buckets - 1) idx = buckets - 1;
        arr[idx]++;
      }
    }
    return arr;
  }
  function svgBars(vals, w, h, opts) {
    opts = opts || {};
    var n = vals.length || 1, max = Math.max.apply(null, vals.concat([1]));
    var gap = opts.gap != null ? opts.gap : Math.max(1, (w / n) * 0.22);
    var bw = (w - (n - 1) * gap) / n; if (bw < 0.5) bw = 0.5;
    var bars = "";
    for (var i = 0; i < n; i++) {
      var v = vals[i] || 0, x = i * (bw + gap);
      if (v > 0) {
        var bh = Math.max(2, (v / max) * (h - 1)), y = h - bh;
        bars += '<rect class="bar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="' + Math.min(1.5, bw / 2).toFixed(1) + '"><title>' + v + '</title></rect>';
      } else {
        bars += '<rect class="bar empty" x="' + x.toFixed(1) + '" y="' + (h - 1).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="1" rx="0.5"></rect>';
      }
    }
    return '<svg class="chart-svg" viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" preserveAspectRatio="none">' + bars + "</svg>";
  }
  function svgSpark(vals, w, h) {
    var n = vals.length; if (!n) return "";
    var max = Math.max.apply(null, vals.concat([1])), step = n > 1 ? w / (n - 1) : w, pts = [];
    for (var i = 0; i < n; i++) { var x = i * step, y = h - (vals[i] / max) * (h - 2) - 1; pts.push(x.toFixed(1) + " " + y.toFixed(1)); }
    var line = "M" + pts.join(" L "), area = line + " L " + w + " " + h + " L 0 " + h + " Z";
    return '<svg class="chart-svg" viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" preserveAspectRatio="none">' +
      '<defs><linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--signal)" stop-opacity=".3"/><stop offset="1" stop-color="var(--signal)" stop-opacity="0"/></linearGradient></defs>' +
      '<path class="spark-area" d="' + area + '"/><path class="spark-line" d="' + line + '"/></svg>';
  }

  // ── i18n glue ──────────────────────────────────────────────
  function applyPromo() {
    var community = t("brand.community");
    var siteLink = '<a href="' + SITE_URL + '" target="_blank" rel="noopener"><b>' + esc(community) + "</b></a>";
    var sitePlain = '<a href="' + SITE_URL + '" target="_blank" rel="noopener">' + esc(community) + "</a>";
    var lf = $("loginFoot"); if (lf) lf.innerHTML = t("login.tool", { zdg: siteLink });
    var ad = $("aboutDesc"); if (ad) ad.innerHTML = t("config.aboutDesc", { zdg: siteLink });
    var fo = $("footerOffered"); if (fo) fo.innerHTML = t("footer.offered", { zdg: sitePlain });
  }
  function buildLangSwitcher() {
    var btn = $("langDDBtn"), cur = $("langDDCur"), menu = $("langDDMenu");
    if (!btn || !menu || !window.I18N) return;
    var active = window.I18N.getLang();
    if (cur) cur.textContent = t("lang." + active);
    menu.innerHTML = window.I18N.langs.map(function (l) {
      return '<li role="option" data-lang="' + l + '"' + (l === active ? ' class="active" aria-selected="true"' : ' aria-selected="false"') + ">" + esc(t("lang." + l)) + "</li>";
    }).join("");
    menu.onclick = function (e) {
      var li = e.target.closest && e.target.closest("[data-lang]"); if (!li) return;
      closeLangMenu(); window.I18N.setLang(li.getAttribute("data-lang"));
    };
    if (!btn._wired) { btn._wired = true; btn.addEventListener("click", function (e) { e.stopPropagation(); toggleLangMenu(); }); }
  }
  function toggleLangMenu() { var dd = $("langDD"); if (!dd) return; var open = dd.classList.toggle("open"); $("langDDBtn").setAttribute("aria-expanded", open ? "true" : "false"); }
  function closeLangMenu() { var dd = $("langDD"); if (dd && dd.classList.contains("open")) { dd.classList.remove("open"); $("langDDBtn").setAttribute("aria-expanded", "false"); } }

  // ── Video lightbox (guide tutorials) ───────────────────────
  function ytIdFromHref(href) { var m = (href || "").match(/(?:youtu\.be\/|[?&]v=|embed\/)([A-Za-z0-9_-]{6,})/); return m ? m[1] : ""; }
  function vlKeydown(e) { if (e.key === "Escape") closeVideoLightbox(); }
  function closeVideoLightbox() { var ov = $("videoLightbox"); if (ov) { ov.parentNode.removeChild(ov); document.body.style.overflow = ""; document.removeEventListener("keydown", vlKeydown); } }
  function openVideoLightbox(id) {
    closeVideoLightbox();
    var ov = document.createElement("div");
    ov.className = "video-lightbox"; ov.id = "videoLightbox";
    ov.innerHTML =
      '<div class="vl-inner">' +
        '<button class="vl-close" type="button" aria-label="' + escAttr(t("form.close")) + '">' + icon("x") + "</button>" +
        '<div class="vl-frame"><iframe src="https://www.youtube.com/embed/' + encodeURIComponent(id) +
          '?autoplay=1&rel=0&playsinline=1&modestbranding=1" title="" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>' +
        '<a class="vl-yt" href="https://youtu.be/' + encodeURIComponent(id) + '" target="_blank" rel="noopener">' + esc(t("video.watchYoutube")) + "</a>" +
      "</div>";
    document.body.appendChild(ov);
    document.body.style.overflow = "hidden";
    requestAnimationFrame(function () { ov.classList.add("open"); });
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) closeVideoLightbox(); });
    ov.querySelector(".vl-close").addEventListener("click", closeVideoLightbox);
    document.addEventListener("keydown", vlKeydown);
  }
  function initVideoLightbox() {
    document.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest(".video-list a[href]") : null; if (!a) return;
      var id = ytIdFromHref(a.getAttribute("href")); if (!id) return;
      e.preventDefault(); openVideoLightbox(id);
    });
  }
  var YT_THUMB_Q = ["maxresdefault", "hqdefault", "mqdefault", "sddefault", "default"];
  function ytThumbFallback(img) {
    var m = (img.src || "").match(/\/vi\/([^/]+)\/(\w+)\.jpg/);
    if (m) { var id = m[1], idx = YT_THUMB_Q.indexOf(m[2]); if (idx >= 0 && idx < YT_THUMB_Q.length - 1) { img.src = "https://img.youtube.com/vi/" + id + "/" + YT_THUMB_Q[idx + 1] + ".jpg"; return; } }
    img.onerror = null; img.style.display = "none"; if (img.parentNode) img.parentNode.classList.add("vthumb-empty");
  }
  function initVideoThumbs() {
    Array.prototype.forEach.call(document.querySelectorAll(".video-list img.vthumb"), function (img) {
      img.addEventListener("error", function () { ytThumbFallback(img); });
      if (img.complete && img.naturalWidth === 0) ytThumbFallback(img);
    });
  }

  function currentTab() { var a = document.querySelector("[data-tab].active"); return a ? a.getAttribute("data-tab") : "overview"; }
  function setPageTitle() { var el = $("pageTitle"); if (el) el.textContent = t("nav." + currentTab()); }
  function refreshDynamicText() {
    applyPromo(); buildLangSwitcher(); setPageTitle(); setLiveUI(); setSoundUI();
    populateEventAppFilter(appsCache); renderApps(appsCache); renderChannelsList();
    afterEventsChanged(); renderOverview();
  }
  function onLangChanged() { refreshDynamicText(); }

  // ── Theme ──────────────────────────────────────────────────
  function applyTheme(th) {
    if (th === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    var b = $("themeBtn"); if (b) b.innerHTML = icon(th === "dark" ? "sun" : "moon");
  }
  function toggleTheme() {
    var th = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    try { localStorage.setItem("hub_theme", th); } catch (e) {}
    applyTheme(th); renderOverview();
  }

  // ── Stats / KPI ────────────────────────────────────────────
  function setStat(id, v) {
    var el = $(id); if (!el) return;
    var target = Number(v) || 0;
    var start = parseInt(String(el.textContent).replace(/[^0-9]/g, ""), 10); if (isNaN(start)) start = 0;
    if (start === target) { el.textContent = target; return; }
    var t0 = 0, dur = 500;
    function step(now) { if (!t0) t0 = now; var p = Math.min(1, (now - t0) / dur); el.textContent = Math.round(start + (target - start) * p); if (p < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }
  function loadStats() {
    api("/api/stats").then(function (s) {
      statsCache = s;
      setStat("statApps", s.apps); setStat("statChannels", s.channels);
      setStat("statEvents", s.eventsLastHour); setStat("statForwards", s.forwardsLastHour);
      var sub = $("kpiSubscribed");
      if (sub) sub.innerHTML = s.channels ? icon("check") + "<span>" + esc(t("overview.subscribed", { n: s.subscribed, total: s.channels })) + "</span>" : "";
      setNavCount("navCountApps", s.apps); setNavCount("navCountChannels", s.channels);
      if (currentTab() === "overview") { renderChannelMix(); renderKpiSpark(); }
    }).catch(function () {});
  }
  function setNavCount(id, n) { var el = $(id); if (!el) return; if (n > 0) { el.textContent = n; el.hidden = false; } else { el.hidden = true; } }

  // ── Overview ───────────────────────────────────────────────
  function renderOverview() {
    if (!$("tab-overview")) return;
    renderKpiSpark(); renderActivityChart(); renderChannelMix(); renderRecentTicker(); renderSidePanel();
  }
  function renderKpiSpark() {
    var box = $("kpiEventsSpark");
    if (box) box.innerHTML = svgSpark(bucketEvents(eventsBuffer, 60, 30), Math.max(120, box.clientWidth || 220), 30);
    var trend = $("kpiEventsTrend");
    if (trend) {
      var b = bucketEvents(eventsBuffer, 60, 2), last30 = b[1] || 0, prev30 = b[0] || 0, up = last30 > prev30 && last30 > 0;
      trend.className = "kpi-trend " + (up ? "up" : "flat");
      trend.innerHTML = (up ? icon("trendUp") : "") + "<span>" + last30 + "</span>";
      trend.title = t("overview.last30");
    }
  }
  function renderActivityChart() {
    var box = $("activityChart"); if (!box) return;
    var w = box.clientWidth || 640, h = 116, buckets = bucketEvents(eventsBuffer, 60, 60);
    box.innerHTML = svgBars(buckets, w, h, { gap: Math.max(1, w / 60 * 0.28) });
    var peak = Math.max.apply(null, buckets.concat([0])), cap = $("activityPeak");
    if (cap) cap.textContent = peak ? t("overview.peak", { n: peak }) : t("overview.quiet");
    if (eventsBuffer.length) box.insertAdjacentHTML("beforeend", '<div class="chart-axis"><span>' + esc(t("overview.minAgo", { n: 60 })) + "</span><span>" + esc(t("time.now")) + "</span></div>");
  }
  function renderChannelMix() {
    var box = $("channelMix"); if (!box) return;
    var bt = (statsCache && statsCache.channelsByType) || { waba: 0, messenger: 0, instagram: 0 };
    var total = (bt.waba || 0) + (bt.messenger || 0) + (bt.instagram || 0);
    if (!total) {
      box.innerHTML = '<div class="hint" style="margin:.2rem 0 .9rem">' + esc(t("overview.mixEmpty")) + "</div>" +
        '<button class="btn" id="mixConnect">' + icon("plug") + " " + esc(t("connect.cta")) + "</button>";
      var mc = $("mixConnect"); if (mc) mc.addEventListener("click", openConnectDrawer);
      return;
    }
    var seg = function (k) { var v = bt[k] || 0; return v ? '<div class="mix-seg ' + k + '" style="width:' + (v / total * 100).toFixed(2) + '%" title="' + escAttr(chName(k) + ": " + v) + '"></div>' : ""; };
    var row = function (k) { var v = bt[k] || 0; return '<div class="mix-row"><span class="dot ' + k + '"></span><span class="mix-name">' + esc(chName(k)) + '</span><span class="mix-val tnum">' + v + "</span></div>"; };
    box.innerHTML = '<div class="mix-bar">' + seg("waba") + seg("messenger") + seg("instagram") + "</div>" +
      '<div class="mix-legend">' + row("waba") + row("messenger") + row("instagram") + "</div>";
  }
  function renderRecentTicker() {
    var box = $("recentTicker"); if (!box) return;
    if (!eventsBuffer.length) { box.innerHTML = emptyState("inbox", t("events.empty"), t("events.emptySub")); return; }
    box.innerHTML = '<div class="ticker">' + eventsBuffer.slice(0, 6).map(function (ev) {
      return '<div class="ticker-row"><span class="tk-rail ' + esc(ev.product || "unknown") + '"></span>' +
        '<span class="tk-sum">' + esc(cleanSummary(ev.summary) || chName(ev.product)) + "</span>" +
        '<span class="tk-app">' + esc(ev.appName || "") + "</span>" +
        '<span class="tk-time" title="' + escAttr(fmtAbs(ev.ts)) + '">' + esc(timeAgo(ev.ts)) + "</span></div>";
    }).join("") + "</div>";
  }
  function renderSidePanel() {
    var box = $("ovSidePanel"); if (!box) return;
    var hasApp = appsCache.length > 0;
    var hasVerify = appsCache.some(function (a) { return a.webhookVerifyTokenSet; });
    var hasChannel = chList.length > 0;
    if (hasApp && hasVerify && hasChannel) {
      box.innerHTML =
        '<div class="panel-eyebrow">' + icon("sparkles") + "<span>" + esc(t("overview.promoEyebrow")) + "</span></div>" +
        '<img class="iw-logo-side" src="/assets/iw-logo.png" alt="InoovaWeb" style="margin:.2rem 0 .85rem" />' +
        '<p style="font-size:.85rem;color:var(--muted);line-height:1.55;margin-bottom:1rem">' + t("config.aboutP") + "</p>" +
        '<div class="side-cta">' +
          '<a class="btn secondary" href="' + SITE_URL + '" target="_blank" rel="noopener">' + esc(t("hero.knowZpro")) + "</a>" +
        "</div>";
      return;
    }
    var item = function (done, titleKey, subKey) {
      return '<div class="check-item ' + (done ? "done" : "") + '"><span class="check-mark">' + icon("check") + "</span>" +
        '<div class="check-body"><div class="check-title">' + esc(t(titleKey)) + '</div><div class="check-sub">' + esc(t(subKey)) + "</div></div></div>";
    };
    var next = !hasApp ? "newapp" : (!hasChannel ? "connect" : null);
    box.innerHTML =
      '<div class="panel-eyebrow">' + icon("rocket") + "<span>" + esc(t("overview.setupTitle")) + "</span></div>" +
      '<div class="checklist">' +
        item(hasApp, "overview.step1Title", "overview.step1Sub") +
        item(hasVerify, "overview.step2Title", "overview.step2Sub") +
        item(hasChannel, "overview.step3Title", "overview.step3Sub") +
      "</div>" +
      (next ? '<div class="check-cta"><button class="btn" id="ovChecklistCta">' + esc(t(next === "newapp" ? "overview.checkAddApp" : "overview.checkConnect")) + "</button></div>" : "");
    var cta = $("ovChecklistCta");
    if (cta) cta.addEventListener("click", function () { if (next === "newapp") { gotoTab("apps"); openAppForm(null); } else openConnectDrawer(); });
  }

  // ── API ────────────────────────────────────────────────────
  function api(path, opts) {
    opts = opts || {}; opts.headers = opts.headers || {};
    if (opts.body && typeof opts.body !== "string") { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(opts.body); }
    if (token) opts.headers["Authorization"] = "Bearer " + token;
    return fetch(path, opts).then(function (r) {
      if (r.status === 401) { doLogout(); throw new Error(t("login.expired")); }
      return r.json().then(function (data) { if (!r.ok) throw new Error(translateErr(data)); return data; });
    });
  }

  // ── Auth ───────────────────────────────────────────────────
  // ── Welcome (initial screen) ───────────────────────────────
  var welcomeProceed = null;
  function welcomedAlready() { try { return localStorage.getItem("hub_welcomed") === "1"; } catch (e) { return false; } }
  function showWelcome(proceed) { welcomeProceed = proceed; hide($("login")); hide($("app")); show($("welcome")); }
  function dismissWelcome() { try { localStorage.setItem("hub_welcomed", "1"); } catch (e) {} hide($("welcome")); var p = welcomeProceed; welcomeProceed = null; if (p) p(); }
  function openWelcome() { showWelcome(function () { show($("app")); }); }

  var adminAuthEnabled = false;
  var terminalEnabled = false;
  function proceedEntry() {
    if (!adminAuthEnabled) {
      api("/api/login", { method: "POST", body: { password: "" } })
        .then(function (res) { token = res.token; localStorage.setItem(TOKEN_KEY, token); enterApp(); })
        .catch(function () { show($("login")); });
    } else if (token) {
      enterApp();
    } else {
      show($("login")); var p = $("loginPass"); if (p) p.focus();
    }
  }
  function bootstrap() {
    fetch("/api/bootstrap").then(function (r) { return r.json(); }).then(function (d) {
      document.title = d.brandName; $("loginBrand").textContent = d.brandName; $("brandName").textContent = d.brandName;
      adminAuthEnabled = !!d.adminAuthEnabled;
      terminalEnabled = !!d.terminalEnabled;
      var navT = $("navTerminal"); if (navT && terminalEnabled) navT.removeAttribute("hidden");
      if (welcomedAlready()) proceedEntry(); else showWelcome(proceedEntry);
    }).catch(function () { show($("login")); });
  }
  function doLogin() {
    $("loginErr").textContent = ""; $("loginBtn").disabled = true;
    api("/api/login", { method: "POST", body: { password: $("loginPass").value } })
      .then(function (res) { token = res.token; localStorage.setItem(TOKEN_KEY, token); hide($("login")); enterApp(); })
      .catch(function (e) { $("loginErr").textContent = e.message || t("login.invalid"); })
      .then(function () { $("loginBtn").disabled = false; });
  }
  function doLogout() {
    token = ""; localStorage.removeItem(TOKEN_KEY);
    if (eventsTimer) { clearInterval(eventsTimer); eventsTimer = null; }
    hide($("app")); hide($("login")); var p = $("loginPass"); if (p) p.value = "";
    showWelcome(proceedEntry);
  }
  function enterApp() { hide($("login")); show($("app")); loadConfig(); startEvents(); activateTab("overview"); }

  // ── Global config ──────────────────────────────────────────
  function loadConfig() {
    api("/api/config").then(function (c) {
      $("brandName").textContent = c.brandName; document.title = c.brandName; $("cfgBrand").value = c.brandName || "";
      publicUrl = c.publicUrl || "";
      var fs = $("footerSource"); if (fs && c.sourceUrl) fs.href = c.sourceUrl;
      fillGuideUrls();
    }).catch(function (e) { toast(e.message, true); });
  }
  function fillGuideUrls() {
    var base = publicUrl || "", host = base.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    function set(codeId, copyId, val) { var c = $(codeId); if (c) c.textContent = val; var b = $(copyId); if (b) b.setAttribute("data-copy-text", val); }
    set("guideDomain", "copyDomain", host);
    set("guideMsgr", "copyMsgr", base + "/connect/messenger");
    set("guideWaba", "copyWaba", base + "/connect/waba");
    set("guideRedirect", "copyRedirect", base + "/connect/instagram/callback");
    var w = $("guideWebhook"); if (w) w.textContent = base + "/webhook/app/SEU_APP_ID";
  }
  function saveSettings() {
    $("saveSettings").disabled = true;
    api("/api/settings", { method: "POST", body: { brandName: $("cfgBrand").value } })
      .then(function () { toast(t("config.saved")); loadConfig(); })
      .catch(function (e) { toast(e.message, true); })
      .then(function () { $("saveSettings").disabled = false; });
  }

  // ── Apps ───────────────────────────────────────────────────
  var FWD_PRODS = ["all", "waba", "messenger", "instagram"];
  var appCollapsed = {}; // per-app collapse state (appId -> bool); default collapsed when many apps
  function loadApps() {
    var el = $("appsList");
    if (el && !el.querySelector(".app-card")) el.innerHTML = skeletonRows(2);
    return api("/api/apps").then(function (d) {
      appsCache = d.apps || [];
      renderApps(appsCache); populateEventAppFilter(appsCache); setNavCount("navCountApps", appsCache.length);
      var hint = $("noAppsHint"); if (hint) { if (appsCache.length === 0) show(hint); else hide(hint); }
      if (currentTab() === "overview") renderSidePanel();
    }).catch(function (e) { toast(e.message, true); });
  }
  function populateEventAppFilter(apps) {
    var sel = $("evtApp"); if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = '<option value="">' + esc(t("events.allApps")) + "</option>" + apps.map(function (a) { return '<option value="' + escAttr(a.id) + '">' + esc(a.name) + "</option>"; }).join("");
    sel.value = cur;
  }

  var CH_COLOR = { waba: "#1faa53", messenger: "#0084FF", instagram: "#E1306C" };
  var CH_IMG = { waba: "/assets/waba.png", messenger: "/assets/messenger.png", instagram: "/assets/instagram.png" };
  function embedUrl(appId, channel) { return publicUrl + "/embed/connect?app=" + encodeURIComponent(appId) + "&channel=" + channel + "&lang=" + (window.I18N ? window.I18N.getLang() : "pt"); }
  function embedSnippet(appId, channel) {
    var url = embedUrl(appId, channel);
    return '<a href="' + url + '" target="_blank" rel="noopener" ' +
      "onclick=\"window.open(this.href,'iw_connect','width=560,height=740');return false;\" " +
      'style="display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:10px;background:' + CH_COLOR[channel] +
      ';color:#fff;font:600 14px/1 -apple-system,Segoe UI,Roboto,sans-serif;text-decoration:none;">' +
      '<img src="' + publicUrl + CH_IMG[channel] + '" alt="" style="width:18px;height:18px;border-radius:4px" /> ' + t("embed." + channel) + "</a>";
  }
  function embedSection(a) {
    if (!a.embedEnabled) return "";
    var rows = ["waba", "messenger", "instagram"].map(function (ch) {
      var snip = embedSnippet(a.id, ch), url = embedUrl(a.id, ch);
      return '<div class="url-box"><span class="lbl">' + esc(chName(ch)) + "</span><code>" + esc(snip) + "</code>" +
        '<button class="btn secondary copy tiny" data-copy-text="' + escAttr(snip) + '">' + esc(t("embed.copy")) + "</button>" +
        '<button class="btn secondary embed-test tiny" data-embed-test="' + escAttr(url) + '">' + esc(t("embed.test")) + "</button></div>";
    }).join("");
    return '<div class="embed-block"><div class="fwd-title">' + esc(t("embed.title")) + "</div>" +
      '<div class="hint" style="margin-bottom:.5rem">' + t("embed.hint") + "</div>" + rows + "</div>";
  }
  function forwardsSummary(fwds) {
    if (!fwds || !fwds.length) return '<span class="sub" style="color:var(--muted-2)">' + esc(t("apps.noForward")) + "</span>";
    return fwds.map(function (f) {
      var prod = (f.products || ["all"]).map(prodLabel).join(", ");
      return '<div class="sub">' + icon("arrowRight") + '<code>' + esc(f.url) + '</code> <span class="badge ' + (f.enabled ? "ok" : "warn") + '">' + esc(f.enabled ? prod : t("apps.inactive")) + "</span></div>";
    }).join("");
  }
  function renderApps(apps) {
    var el = $("appsList"); if (!el) return;
    if (!apps.length) { el.innerHTML = emptyState("grid", t("apps.empty"), t("apps.emptySub")); return; }
    var defined = t("apps.defined"), undef = '<b style="color:var(--warn)">' + esc(t("apps.undefined")) + "</b>";
    el.innerHTML = apps.map(function (a) {
      var modeBadge = a.storeEvents
        ? '<span class="badge ok">' + esc(t("apps.badgeHistory")) + "</span>"
        : '<span class="badge warn" title="' + escAttr(t("apps.badgeTransactionalTitle")) + '">' + esc(t("apps.badgeTransactional")) + "</span>";
      var embedBadge = a.embedEnabled ? ' <span class="badge messenger">' + esc(t("apps.badgeEmbed")) + "</span>" : "";
      var coll = appCollapsed.hasOwnProperty(a.id) ? appCollapsed[a.id] : (apps.length >= 3);
      return '<div class="app-card' + (coll ? " collapsed" : "") + '">' +
        '<div class="app-head">' +
          '<div class="app-title"><span class="app-name">' + esc(a.name) + '</span> <span class="badge neutral">' + a.channelCount + " " + esc(t("apps.channelsSuffix")) + "</span> " + modeBadge + embedBadge + "</div>" +
          '<div class="app-head-actions"><button class="btn secondary tiny" data-editapp="' + escAttr(a.id) + '">' + esc(t("apps.edit")) + "</button>" +
          '<button class="btn danger tiny" data-delapp="' + escAttr(a.id) + '">' + esc(t("apps.remove")) + "</button>" +
          '<button class="btn ghost icon-btn tiny app-toggle" data-toggleapp="' + escAttr(a.id) + '" aria-expanded="' + (coll ? "false" : "true") + '" title="' + escAttr(t("apps.toggle")) + '">' + icon("chevron") + "</button></div>" +
        "</div>" +
        '<div class="app-body">' +
          '<div class="sub mono">' + esc(t("apps.appId")) + ": " + esc(a.appId) + " · " + esc(t("apps.api")) + " " + esc(a.apiVersion) +
            " · " + esc(t("apps.verifyToken")) + " " + (a.webhookVerifyTokenSet ? esc(defined) : undef) +
            " · " + esc(t("apps.secret")) + " " + (a.hasAppSecret ? esc(defined) : undef) + "</div>" +
          '<div class="url-box" style="margin-top:.7rem"><span class="lbl">' + esc(t("apps.webhook")) + '</span><code>' + esc(a.webhookUrls.unified) + '</code><button class="btn secondary copy tiny" data-copy-text="' + escAttr(a.webhookUrls.unified) + '">' + esc(t("apps.copy")) + "</button></div>" +
          '<div class="url-box"><span class="lbl">' + esc(t("apps.igRedirect")) + '</span><code>' + esc(a.redirectUri) + '</code><button class="btn secondary copy tiny" data-copy-text="' + escAttr(a.redirectUri) + '">' + esc(t("apps.copy")) + "</button></div>" +
          '<div class="fwd-summary">' + forwardsSummary(a.forwards) + "</div>" +
          embedSection(a) +
        "</div>" +
      "</div>";
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll("[data-editapp]"), function (b) {
      b.addEventListener("click", function () { var a = appsCache.filter(function (x) { return x.id === b.getAttribute("data-editapp"); })[0]; if (a) openAppForm(a); });
    });
    Array.prototype.forEach.call(el.querySelectorAll("[data-delapp]"), function (b) {
      b.addEventListener("click", function () {
        confirmModal(t("apps.removeConfirm"), t("apps.remove"), true).then(function (ok) {
          if (!ok) return;
          api("/api/apps/" + encodeURIComponent(b.getAttribute("data-delapp")), { method: "DELETE" })
            .then(function () { toast(t("apps.removed")); loadApps(); loadStats(); })
            .catch(function (e) { toast(e.message, true); });
        });
      });
    });
    Array.prototype.forEach.call(el.querySelectorAll("[data-toggleapp]"), function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-toggleapp"), card = b.closest(".app-card");
        var nowColl = !card.classList.contains("collapsed");
        card.classList.toggle("collapsed", nowColl);
        appCollapsed[id] = nowColl;
        b.setAttribute("aria-expanded", nowColl ? "false" : "true");
      });
    });
  }

  // ── App form (drawer) ──────────────────────────────────────
  function fwdRowHtml(f) {
    f = f || { url: "", products: ["all"], enabled: true };
    var prod = (f.products && f.products.indexOf("all") < 0 && f.products[0]) ? f.products[0] : "all";
    var opts = FWD_PRODS.map(function (p) { return '<option value="' + p + '"' + (p === prod ? " selected" : "") + ">" + esc(prodLabel(p)) + "</option>"; }).join("");
    return '<div class="fwd-row">' +
      '<input class="fwd-url" placeholder="' + escAttr(t("form.fwdUrlPh")) + '" value="' + escAttr(f.url) + '" />' +
      '<select class="fwd-prod">' + opts + "</select>" +
      '<label class="fwd-en"><input type="checkbox"' + (f.enabled !== false ? " checked" : "") + " /> " + esc(t("form.fwdActive")) + "</label>" +
      '<button type="button" class="btn ghost fwd-del" title="' + escAttr(t("apps.remove")) + '">×</button>' +
    "</div>";
  }

  var drawerEl = null, drawerReturnFocus = null;
  function closeDrawer() {
    if (!drawerEl) return;
    var el = drawerEl; drawerEl = null;
    el.classList.remove("open");
    document.removeEventListener("keydown", drawerKeydown);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    if (drawerReturnFocus && drawerReturnFocus.focus) { try { drawerReturnFocus.focus(); } catch (e) {} }
    drawerReturnFocus = null;
  }
  function drawerKeydown(e) {
    if (!drawerEl) return;
    if (e.key === "Escape") { closeDrawer(); return; }
    if (e.key === "Tab") {
      var f = drawerEl.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  function field(id, labelKey, value, phKey, type, extraLabel) {
    return '<div class="field"><label for="' + id + '">' + esc(t(labelKey)) + (extraLabel || "") + '</label>' +
      '<input id="' + id + '"' + (type ? ' type="' + type + '"' : "") + (value != null ? ' value="' + escAttr(value) + '"' : "") +
      ' placeholder="' + escAttr(t(phKey)) + '" /></div>';
  }
  function openAppForm(app) {
    closeDrawer();
    drawerReturnFocus = document.activeElement;
    var isEdit = !!app; app = app || {};
    var secPh = app.hasAppSecret ? "form.secretKeep" : "form.appSecret";
    var igSecPh = app.hasInstagramAppSecret ? "form.secretKeep" : "form.igSecretPh";
    var verifyPh = app.webhookVerifyTokenSet ? "form.verifyTokenKeep" : "form.verifyTokenPh";
    var title = isEdit ? t("form.editTitle") : t("form.newTitle");
    var fields =
      '<div class="grid2">' + field("afName", "form.name", app.name || "", "form.namePh") + field("afAppId", "form.appId", app.appId || "", "form.appId") + "</div>" +
      '<div class="grid2">' + field("afAppSecret", "form.appSecret", null, secPh, "password") + field("afApiVersion", "form.apiVersion", app.apiVersion || "", "form.apiVersion") + "</div>" +
      '<div class="grid2">' + field("afVerify", "form.verifyToken", null, verifyPh) + field("afWaba", "form.wabaConfig", app.wabaConfigId || "", "form.wabaConfigPh") + "</div>" +
      '<div class="grid2">' + field("afMsgr", "form.msgrConfig", app.messengerConfigId || "", "form.msgrConfigPh") + field("afIgId", "form.igId", app.instagramAppId || "", "form.igIdPh", null, ' <span class="hint">' + esc(t("form.optional")) + "</span>") + "</div>" +
      field("afIgSecret", "form.igSecret", null, igSecPh, "password") +
      '<div class="field"><label for="afMsgrToken">' + esc(t("form.fallbackToken")) + ' <span class="hint">' + esc(t("form.optional")) + "</span></label>" +
        '<input id="afMsgrToken" placeholder="' + escAttr(t(app.hasMessengerFallbackToken ? "form.secretKeep" : "form.fallbackTokenPh")) + '" />' +
        '<div class="hint">' + esc(t("form.fallbackTokenHint")) + "</div></div>" +
      '<div class="mode-block">' +
        '<label class="mode-toggle"><input type="checkbox" id="afStore"' + (app.storeEvents === false ? "" : " checked") + " /> <b>" + esc(t("form.storeToggle")) + "</b></label>" +
        '<div class="hint">' + t("form.storeHint") + "</div>" +
        '<label class="mode-toggle" style="margin-top:.7rem"><input type="checkbox" id="afEmbed"' + (app.embedEnabled ? " checked" : "") + " /> <b>" + esc(t("form.embedToggle")) + "</b></label>" +
        '<div class="hint">' + esc(t("form.embedHint")) + "</div>" +
      "</div>" +
      '<div class="fwd-block">' +
        '<div class="fwd-title">' + esc(t("form.fwdTitle")) + "</div>" +
        '<div class="hint" style="margin-bottom:.5rem">' + esc(t("form.fwdHint")) + "</div>" +
        '<div id="afForwards">' + (app.forwards && app.forwards.length ? app.forwards.map(fwdRowHtml).join("") : "") + "</div>" +
        '<button type="button" class="btn secondary" id="afAddFwd" style="margin-top:.5rem">' + esc(t("form.fwdAdd")) + "</button>" +
      "</div>";

    var ov = document.createElement("div"); ov.className = "drawer-overlay";
    ov.innerHTML =
      '<div class="drawer" role="dialog" aria-modal="true" aria-label="' + escAttr(title) + '">' +
        '<div class="drawer-head"><h3>' + esc(title) + '</h3><button class="btn ghost icon-btn" id="afClose" aria-label="' + escAttr(t("form.close")) + '">' + icon("x") + "</button></div>" +
        '<div class="drawer-body">' + fields + "</div>" +
        '<div class="drawer-foot"><button class="btn ghost" id="afCancel">' + esc(t("form.cancel")) + '</button><button class="btn" id="afSave">' + esc(isEdit ? t("form.save") : t("form.create")) + "</button></div>" +
      "</div>";
    document.body.appendChild(ov); drawerEl = ov;
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) closeDrawer(); });
    $("afClose").addEventListener("click", closeDrawer);
    $("afCancel").addEventListener("click", closeDrawer);
    $("afAddFwd").addEventListener("click", function () { $("afForwards").insertAdjacentHTML("beforeend", fwdRowHtml(null)); wireFwdDeletes(); });
    $("afSave").addEventListener("click", function () { saveApp(isEdit ? app.id : null); });
    wireFwdDeletes();
    document.addEventListener("keydown", drawerKeydown);
    requestAnimationFrame(function () { ov.classList.add("open"); });
    setTimeout(function () { var f = $("afName"); if (f) f.focus(); }, 60);
  }
  function wireFwdDeletes() {
    Array.prototype.forEach.call(document.querySelectorAll(".fwd-del"), function (b) { b.onclick = function () { b.parentNode.parentNode.removeChild(b.parentNode); }; });
  }
  function collectForwards() {
    return Array.prototype.map.call(document.querySelectorAll("#afForwards .fwd-row"), function (row) {
      return { url: row.querySelector(".fwd-url").value.trim(), products: [row.querySelector(".fwd-prod").value], enabled: row.querySelector(".fwd-en input").checked };
    }).filter(function (f) { return f.url; });
  }
  function saveApp(id) {
    var body = {
      name: $("afName").value, appId: $("afAppId").value, apiVersion: $("afApiVersion").value,
      wabaConfigId: $("afWaba").value, messengerConfigId: $("afMsgr").value, instagramAppId: $("afIgId").value, forwards: collectForwards(),
    };
    var storeEl = $("afStore"); if (storeEl) body.storeEvents = storeEl.checked;
    var embedEl = $("afEmbed"); if (embedEl) body.embedEnabled = embedEl.checked;
    if ($("afAppSecret").value) body.appSecret = $("afAppSecret").value;
    if ($("afIgSecret").value) body.instagramAppSecret = $("afIgSecret").value;
    if ($("afMsgrToken") && $("afMsgrToken").value.trim()) body.messengerFallbackToken = $("afMsgrToken").value.trim();
    if ($("afVerify").value) body.webhookVerifyToken = $("afVerify").value;
    if (!body.name.trim()) { toast(t("form.nameRequired"), true); return; }
    if (!body.appId.trim()) { toast(t("form.appIdRequired"), true); return; }
    $("afSave").disabled = true;
    var req = id ? api("/api/apps/" + encodeURIComponent(id), { method: "PUT", body: body }) : api("/api/apps", { method: "POST", body: body });
    req.then(function () { toast(id ? t("apps.updated") : t("apps.created")); closeDrawer(); loadApps(); loadStats(); })
      .catch(function (e) { toast(e.message, true); })
      .then(function () { var s = $("afSave"); if (s) s.disabled = false; });
  }

  // ── Channels (health cards) ────────────────────────────────
  var chList = [], chAutoTried = {};
  function loadChannels() {
    var el = $("channelsList");
    if (el && !el.querySelector(".health")) el.innerHTML = skeletonRows(3);
    api("/api/channels").then(function (d) {
      chList = d.channels || []; setNavCount("navCountChannels", chList.length);
      renderChannelsList(); autoRefreshChannels();
      if (currentTab() === "overview") renderSidePanel();
    }).catch(function (e) { toast(e.message, true); });
  }
  function chHasDetails(c) { return c.meta && (c.meta.avatar || (c.meta.details && c.meta.details.length)); }
  var CH_FLABEL = { quality: "channels.fQuality", tier: "channels.fTier", fans: "channels.fFans", followers: "channels.fFollowers", posts: "channels.fPosts" };
  function chAvatar(c) {
    var init = esc((String(c.name || "?").trim().charAt(0) || "?").toUpperCase());
    var av = c.meta && c.meta.avatar;
    return '<span class="ch-avatar ch-' + esc(c.type) + '" data-initial="' + init + '">' + (av ? '<img src="' + escAttr(av) + '" alt="" onerror="this.remove()" />' : "") + "</span>";
  }
  function chDetails(c) {
    var d = c.meta && c.meta.details;
    if (!d || !d.length) return "";
    return '<div class="health-foot">' + d.map(function (f) {
      var lbl = CH_FLABEL[f.k] ? " " + esc(t(CH_FLABEL[f.k])) : "";
      return '<span class="ch-chip"><b>' + esc(f.v) + "</b>" + lbl + "</span>";
    }).join("") + "</div>";
  }
  function channelSpark(id) {
    var evs = eventsBuffer.filter(function (e) { return e.channelId === id; });
    return svgBars(bucketEvents(evs, 60, 18), 116, 30, { gap: 2 });
  }
  function renderChannelsList() {
    var el = $("channelsList"); if (!el) return;
    if (!chList.length) { el.innerHTML = emptyState("plug", t("channels.empty"), t("channels.emptySub")); return; }
    el.innerHTML = chList.map(function (c) {
      var sub = c.subscribed
        ? '<span class="badge ok dot">' + esc(t("channels.webhookOk")) + "</span>"
        : '<span class="badge warn dot" title="' + escAttr(c.subscribeError || "") + '">' + esc(t("channels.webhookPending")) + "</span>";
      var last = c.lastEventAt
        ? t("channels.lastEvent", { t: '<span title="' + escAttr(fmtAbs(c.lastEventAt)) + '">' + esc(timeAgo(c.lastEventAt)) + "</span>" })
        : esc(t("channels.noEvents"));
      return '<div class="health ' + esc(c.type) + '">' +
          '<div class="health-top">' + chAvatar(c) +
            '<div class="health-name"><div class="nm">' + esc(c.name) + ' <span class="badge ' + c.type + '">' + esc(chName(c.type)) + "</span></div>" +
              '<div class="meta-line" title="' + escAttr(t("channels.idPrefix") + ": " + c.externalId + " · " + t("channels.appPrefix") + ": " + c.appName) + '">' + esc(c.externalId) + " · " + esc(c.appName) + "</div></div>" +
            '<div class="health-actions">' +
              '<button class="btn ghost icon-btn tiny" data-refresh="' + escAttr(c.id) + '" title="' + escAttr(t("channels.refresh")) + '">' + icon("refresh") + "</button>" +
              '<button class="btn danger tiny" data-del="' + escAttr(c.id) + '">' + esc(t("channels.remove")) + "</button>" +
            "</div>" +
          "</div>" +
          '<div class="health-mid"><div class="h-last">' + sub + " · " + last + '</div><div class="health-spark">' + channelSpark(c.id) + "</div></div>" +
          chDetails(c) +
        "</div>";
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll("[data-del]"), function (btn) {
      btn.addEventListener("click", function () {
        confirmModal(t("channels.removeConfirm"), t("channels.remove"), true).then(function (ok) {
          if (!ok) return;
          api("/api/channels/" + encodeURIComponent(btn.getAttribute("data-del")), { method: "DELETE" })
            .then(function () { toast(t("channels.removed")); loadChannels(); loadApps(); loadStats(); })
            .catch(function (e) { toast(e.message, true); });
        });
      });
    });
    Array.prototype.forEach.call(el.querySelectorAll("[data-refresh]"), function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-refresh"); btn.disabled = true;
        api("/api/channels/" + encodeURIComponent(id) + "/refresh", { method: "POST" })
          .then(function (d) { if (d && d.channel) patchChannel(d.channel); toast(t("channels.refreshed")); })
          .catch(function (e) { toast(e.message, true); btn.disabled = false; });
      });
    });
  }
  function patchChannel(ch) { var i = chList.findIndex(function (x) { return x.id === ch.id; }); if (i >= 0) chList[i] = ch; renderChannelsList(); }
  function autoRefreshChannels() {
    chList.forEach(function (c) {
      if (chHasDetails(c) || chAutoTried[c.id]) return;
      chAutoTried[c.id] = true;
      api("/api/channels/" + encodeURIComponent(c.id) + "/refresh", { method: "POST" })
        .then(function (d) { if (d && d.channel) patchChannel(d.channel); }).catch(function () {});
    });
  }

  // ── Connect drawer ─────────────────────────────────────────
  function connectPick(ch) {
    return '<button class="connect-pick" data-cd="' + ch + '"><img class="ch-logo" src="/assets/' + ch + '.png" alt="" />' +
      '<span class="cp-txt"><span>' + esc(t("connect." + ch)) + "</span><small>" + esc(t("connect." + ch + "Sub")) + "</small></span></button>";
  }
  function openConnectDrawer() {
    closeDrawer();
    drawerReturnFocus = document.activeElement;
    var inner;
    if (!appsCache.length) {
      inner = '<div class="drawer-intro">' + t("connect.noApps") + "</div><button class=\"btn\" id=\"cdNewApp\">" + esc(t("onboarding.cta")) + "</button>";
    } else {
      var opts = appsCache.map(function (a) { return '<option value="' + escAttr(a.id) + '">' + esc(a.name) + "</option>"; }).join("");
      inner = '<div class="drawer-intro">' + esc(t("connect.desc")) + "</div>" +
        '<div class="field"><label for="cdApp">' + esc(t("connect.appLabel")) + '</label><select id="cdApp">' + opts + "</select></div>" +
        '<div class="connect-grid">' + connectPick("waba") + connectPick("instagram") + connectPick("messenger") + "</div>";
    }
    var ov = document.createElement("div"); ov.className = "drawer-overlay";
    ov.innerHTML =
      '<div class="drawer narrow" role="dialog" aria-modal="true" aria-label="' + escAttr(t("connect.cta")) + '">' +
        '<div class="drawer-head"><h3>' + esc(t("connect.cta")) + '</h3><button class="btn ghost icon-btn" id="cdClose" aria-label="' + escAttr(t("form.close")) + '">' + icon("x") + "</button></div>" +
        '<div class="drawer-body">' + inner + "</div>" +
      "</div>";
    document.body.appendChild(ov); drawerEl = ov;
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) closeDrawer(); });
    $("cdClose").addEventListener("click", closeDrawer);
    var nb = $("cdNewApp"); if (nb) nb.addEventListener("click", function () { closeDrawer(); gotoTab("apps"); openAppForm(null); });
    Array.prototype.forEach.call(ov.querySelectorAll("[data-cd]"), function (b) {
      b.addEventListener("click", function () { var ap = $("cdApp"); connect(b.getAttribute("data-cd"), ap ? ap.value : null); });
    });
    document.addEventListener("keydown", drawerKeydown);
    requestAnimationFrame(function () { ov.classList.add("open"); });
    setTimeout(function () { var f = $("cdApp") || $("cdNewApp"); if (f) f.focus(); }, 60);
  }
  function connect(channel, appId) {
    if (!appId) { toast(t("connect.needApp"), true); return; }
    api("/api/connect/" + channel + "/init", { method: "POST", body: { appId: appId, lang: window.I18N ? window.I18N.getLang() : "pt" } })
      .then(function (d) { var w = window.open(d.url, "hub_connect", "width=560,height=740"); if (!w) toast(t("connect.popupBlocked"), true); else closeDrawer(); })
      .catch(function (e) { toast(e.message, true); });
  }
  window.addEventListener("message", function (e) {
    if (e.origin !== window.location.origin) return;
    if (e.data && e.data.type === "hub:connected") {
      toast(e.data.ok ? t("connect.connected") : t("connect.notCompleted"), !e.data.ok);
      loadChannels(); loadApps(); loadStats();
    }
  });

  // ── Events (live console) ──────────────────────────────────
  var eventsBuffer = [], newIds = {};
  var audioCtx = null;
  function blip() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator(), g = audioCtx.createGain(), t0 = audioCtx.currentTime;
      o.type = "sine"; o.frequency.setValueAtTime(880, t0); o.frequency.exponentialRampToValueAtTime(1320, t0 + .08);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.1, t0 + .01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + .2);
      o.connect(g); g.connect(audioCtx.destination); o.start(t0); o.stop(t0 + .22);
    } catch (e) {}
  }
  function startEvents() {
    fetchEvents(true);
    if (eventsTimer) clearInterval(eventsTimer);
    eventsTimer = setInterval(function () { if (liveOn) { fetchEvents(false); loadStats(); } }, 3000);
  }
  function fetchEvents(replace) {
    var el = $("eventsList");
    if (replace && el && !el.querySelector(".event")) el.innerHTML = skeletonRows(3);
    var q = (!replace && lastEventTs) ? ("?since=" + encodeURIComponent(lastEventTs)) : "";
    api("/api/events" + q).then(function (d) {
      var evs = d.events || [];
      if (replace) {
        eventsBuffer = evs;
      } else if (evs.length) {
        eventsBuffer = evs.concat(eventsBuffer);
        if (eventsBuffer.length > 400) eventsBuffer = eventsBuffer.slice(0, 400);
        evs.forEach(function (e) { newIds[e.id] = 1; });
        if (soundOn) blip();
        setTimeout(function () { evs.forEach(function (e) { delete newIds[e.id]; }); }, 1800);
      }
      if (eventsBuffer.length) lastEventTs = eventsBuffer[0].ts;
      afterEventsChanged();
    }).catch(function () {});
  }
  function afterEventsChanged() {
    renderConsoleVolume();
    renderEventsFiltered();
    if (currentTab() === "overview") renderOverview();
  }
  function renderConsoleVolume() {
    var box = $("consoleSpark"); if (box) box.innerHTML = svgBars(bucketEvents(eventsBuffer, 60, 40), 120, 24, { gap: 1.4 });
    var num = $("consoleVolNum"); if (num) num.textContent = t("events.volHour", { n: bucketEvents(eventsBuffer, 60, 1)[0] || 0 });
  }
  function badgeForProduct(p) { var cls = (p === "waba" || p === "messenger" || p === "instagram") ? p : "neutral"; return '<span class="badge ' + cls + '">' + esc(chName(p)) + "</span>"; }
  function fwdBadges(fwds) {
    if (!fwds || !fwds.length) return "";
    return fwds.map(function (f) { var ok = f.status === "pending" ? "warn" : (f.ok ? "ok" : "warn"); return ' <span class="badge ' + ok + '" title="' + escAttr(f.url) + '">' + esc(String(f.status)) + "</span>"; }).join("");
  }
  function cleanSummary(s) { return String(s == null ? "" : s).replace(/\[object Object\]/g, "—"); }
  function highlightJson(obj) {
    var json; try { json = JSON.stringify(obj, null, 2); } catch (e) { json = String(obj); }
    if (json == null) return "";
    var out = "", re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, last = 0, m;
    while ((m = re.exec(json))) {
      out += esc(json.slice(last, m.index));
      if (m[1] !== undefined) out += '<span class="' + (m[2] ? "tok-key" : "tok-str") + '">' + esc(m[1]) + (m[2] ? esc(m[2]) : "") + "</span>";
      else if (m[3] !== undefined) out += '<span class="tok-' + (m[3] === "null" ? "null" : "bool") + '">' + m[3] + "</span>";
      else if (m[4] !== undefined) out += '<span class="tok-num">' + m[4] + "</span>";
      last = re.lastIndex;
    }
    out += esc(json.slice(last));
    return out;
  }
  function eventHtml(ev) {
    var sigBadge = ev.signatureValid === false ? ' <span class="badge warn" title="' + escAttr(t("events.sigBadTitle")) + '">' + esc(t("events.sigBad")) + "</span>" : "";
    var isNew = newIds[ev.id] ? " event-new" : "";
    return '<div class="event event-' + esc(ev.product) + isNew + '">' +
        '<span class="ev-rail"></span>' +
        '<span class="ev-time" title="' + escAttr(fmtAbs(ev.ts)) + '">' + esc(timeAgo(ev.ts)) + "</span>" +
        '<div class="ev-main">' +
          '<div class="ev-head">' + badgeForProduct(ev.product) +
            '<span class="badge ' + (ev.appId ? "neutral" : "warn") + '">' + esc(ev.appName) + "</span>" +
            '<span class="badge ' + (ev.channelId ? "ok" : "warn") + '">' + esc(ev.channelId ? t("events.channel") : t("events.noChannel")) + "</span>" +
            sigBadge + fwdBadges(ev.forwards) +
          "</div>" +
          '<div class="ev-summary">' + esc(cleanSummary(ev.summary)) + "</div>" +
          "<details><summary>" + esc(t("events.payload")) + '</summary><pre>' + highlightJson(ev.raw) + "</pre>" +
            '<button class="btn secondary copy tiny" data-copy-text="' + escAttr(JSON.stringify(ev.raw)) + '" style="margin-top:.5rem">' + esc(t("events.copyPayload")) + "</button>" +
          "</details>" +
        "</div>" +
      "</div>";
  }
  function eventMatches(e) {
    var p = $("evtProduct") ? $("evtProduct").value : ""; if (p && e.product !== p) return false;
    var a = $("evtApp") ? $("evtApp").value : ""; if (a && e.appId !== a) return false;
    var q = $("evtSearch") ? $("evtSearch").value.trim().toLowerCase() : "";
    if (q && (e.summary || "").toLowerCase().indexOf(q) < 0 && (e.appName || "").toLowerCase().indexOf(q) < 0) return false;
    return true;
  }
  var EVT_PAGE_SIZE = 20, evtPage = 0;
  function renderEventsFiltered() {
    var el = $("eventsList"); if (!el) return;
    var list = eventsBuffer.filter(eventMatches);
    if (!list.length) {
      el.innerHTML = eventsBuffer.length ? emptyState("inbox", t("events.noMatch"), t("events.noMatchSub")) : emptyState("inbox", t("events.empty"), t("events.emptySub"));
      return;
    }
    var pages = Math.ceil(list.length / EVT_PAGE_SIZE);
    if (evtPage >= pages) evtPage = pages - 1; if (evtPage < 0) evtPage = 0;
    var pageList = list.slice(evtPage * EVT_PAGE_SIZE, (evtPage + 1) * EVT_PAGE_SIZE);
    var pager = pages > 1
      ? '<div class="pager">' +
          '<button class="btn secondary" id="evtPrev"' + (evtPage === 0 ? " disabled" : "") + ">" + esc(t("events.prev")) + "</button>" +
          '<span class="pager-info">' + esc(t("events.pageOf", { cur: evtPage + 1, total: pages })) + "</span>" +
          '<button class="btn secondary" id="evtNext"' + (evtPage >= pages - 1 ? " disabled" : "") + ">" + esc(t("events.next")) + "</button>" +
        "</div>" : "";
    el.innerHTML = pageList.map(eventHtml).join("") + pager;
    var pv = $("evtPrev"); if (pv) pv.addEventListener("click", function () { evtPage--; renderEventsFiltered(); window.scrollTo(0, 0); });
    var nx = $("evtNext"); if (nx) nx.addEventListener("click", function () { evtPage++; renderEventsFiltered(); window.scrollTo(0, 0); });
  }
  function onEvtFilter() { evtPage = 0; renderEventsFiltered(); }
  function clearEvents() {
    confirmModal(t("events.clearConfirm"), t("events.clear"), true).then(function (ok) {
      if (!ok) return;
      api("/api/events/clear", { method: "POST" }).then(function () { lastEventTs = ""; eventsBuffer = []; afterEventsChanged(); toast(t("events.cleared")); }).catch(function (e) { toast(e.message, true); });
    });
  }
  function setLive(on) { liveOn = on; setLiveUI(); if (on) { fetchEvents(false); loadStats(); } }
  function setLiveUI() {
    var b = $("liveToggle");
    if (b) { b.classList.toggle("paused", !liveOn); b.setAttribute("aria-pressed", liveOn ? "true" : "false"); var l = $("liveToggleLbl"); if (l) l.textContent = t(liveOn ? "events.live" : "events.paused"); }
    var s = $("liveStatus"); if (s) { s.classList.toggle("paused", !liveOn); s.textContent = t(liveOn ? "topbar.monitoring" : "topbar.paused"); }
  }
  function setSound(on) { soundOn = on; try { localStorage.setItem("hub_sound", on ? "1" : "0"); } catch (e) {} setSoundUI(); if (on) blip(); }
  function setSoundUI() { var b = $("soundToggle"); if (b) { b.innerHTML = icon(soundOn ? "sound" : "soundOff"); b.classList.toggle("active", soundOn); } }

  // ── Terminal de demonstração (só com DEMO_TERMINAL=1) ──────
  var TERM = { term: null, fit: null, ws: null, ready: false, wired: false };
  function termStatus(key, on) {
    var d = $("termDot"); if (d) d.classList.toggle("on", !!on);
    var s = $("termStatus"); if (s) s.textContent = t(key);
  }
  function termInit() {
    if (TERM.term || !window.Terminal) return;
    TERM.term = new window.Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 13, cursorBlink: true, convertEol: true, scrollback: 4000,
      theme: { background: "#0b0f0d", foreground: "#d7e0da", cursor: "#25d366" }
    });
    if (window.FitAddon && window.FitAddon.FitAddon) {
      TERM.fit = new window.FitAddon.FitAddon();
      TERM.term.loadAddon(TERM.fit);
    }
    TERM.term.open($("termHost"));
    TERM.term.onData(function (d) {
      if (TERM.ws && TERM.ws.readyState === 1 && TERM.ready) TERM.ws.send(JSON.stringify({ type: "in", data: d }));
    });
    window.addEventListener("resize", termFit);
  }
  function termFit() {
    if (!TERM.fit || !TERM.term) return;
    try { TERM.fit.fit(); } catch (e) { return; }
    if (TERM.ws && TERM.ws.readyState === 1 && TERM.ready) {
      TERM.ws.send(JSON.stringify({ type: "resize", cols: TERM.term.cols, rows: TERM.term.rows }));
    }
  }
  function termConnect() {
    if (!terminalEnabled) return;
    termInit();
    if (!TERM.term) { termStatus("terminal.noLib", false); return; }
    if (TERM.ws && (TERM.ws.readyState === 0 || TERM.ws.readyState === 1)) return;
    TERM.ready = false;
    termStatus("terminal.connecting", false);
    var ws;
    try { ws = new WebSocket((location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host + "/ws/terminal"); }
    catch (e) { termStatus("terminal.closed", false); return; }
    TERM.ws = ws;
    ws.onopen = function () {
      try { TERM.fit && TERM.fit.fit(); } catch (e) {}
      ws.send(JSON.stringify({ type: "auth", token: token, cols: TERM.term.cols, rows: TERM.term.rows }));
    };
    ws.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.type === "ready") { TERM.ready = true; termStatus("terminal.connected", true); termFit(); }
      else if (m.type === "out") TERM.term.write(m.data);
    };
    ws.onclose = function (ev) {
      TERM.ready = false;
      termStatus(ev && ev.code === 4003 ? "terminal.denied" : "terminal.closed", false);
    };
    ws.onerror = function () { TERM.ready = false; termStatus("terminal.closed", false); };
  }
  function termDisconnect() {
    if (TERM.ws) { try { TERM.ws.close(); } catch (e) {} TERM.ws = null; }
    TERM.ready = false;
  }
  function terminalOnShow() {
    if (!TERM.wired) {
      TERM.wired = true;
      var r = $("termReconnect"); if (r) r.addEventListener("click", function () { termDisconnect(); termConnect(); });
      var c = $("termClear"); if (c) c.addEventListener("click", function () { if (TERM.term) TERM.term.clear(); });
    }
    termConnect();
    setTimeout(termFit, 60);
    setTimeout(function () { if (TERM.term) TERM.term.focus(); }, 120);
  }

  // ── Tabs ───────────────────────────────────────────────────
  function activateTab(tab) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-tab]"), function (b) {
      var on = b.getAttribute("data-tab") === tab;
      b.classList.toggle("active", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    TABS.forEach(function (tt) {
      var sec = $("tab-" + tt);
      if (tt === tab) { show(sec); if (sec) { sec.classList.remove("tab-enter"); void sec.offsetWidth; sec.classList.add("tab-enter"); } }
      else hide(sec);
    });
    setPageTitle();
    if (tab === "overview") { loadStats(); loadApps(); loadChannels(); renderOverview(); }
    if (tab === "channels") { loadChannels(); loadApps(); }
    if (tab === "events") { fetchEvents(true); }
    if (tab === "apps") loadApps();
    if (tab === "config") loadConfig();
    if (tab === "guide") fillGuideUrls();
    if (tab === "evidence") evidenceOnShow();
    if (tab === "terminal") terminalOnShow(); else termDisconnect();
    window.scrollTo(0, 0);
  }
  function gotoTab(tab) { activateTab(tab); }
  function setupTabs() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-tab]"), function (btn) {
      btn.addEventListener("click", function () { activateTab(btn.getAttribute("data-tab")); });
    });
  }

  // ── Command palette (Ctrl/Cmd-K) ───────────────────────────
  var CMDK = { open: false, items: [], active: 0 };
  function buildCommands() {
    var cmds = [];
    var navMap = { overview: "dash", events: "activity", channels: "plug", apps: "grid", config: "sliders", guide: "book", evidence: "check", terminal: "terminal" };
    TABS.forEach(function (tab) {
      if (tab === "terminal" && !terminalEnabled) return;
      cmds.push({ group: t("cmdk.navigate"), title: t("nav." + tab), icon: navMap[tab], kw: tab, run: function () { gotoTab(tab); } });
    });
    cmds.push({ group: t("cmdk.actions"), title: t("connect.cta"), icon: "plug", kw: "conectar connect canal channel", run: function () { gotoTab("channels"); openConnectDrawer(); } });
    cmds.push({ group: t("cmdk.actions"), title: t("apps.new"), icon: "plus", kw: "novo app new", run: function () { gotoTab("apps"); openAppForm(null); } });
    cmds.push({ group: t("cmdk.actions"), title: t("cmdk.toggleTheme"), icon: "moon", kw: "tema theme dark light escuro claro", run: function () { toggleTheme(); } });
    cmds.push({ group: t("cmdk.actions"), title: t("cmdk.toggleLive"), icon: "activity", kw: "live ao vivo pausar pause", run: function () { setLive(!liveOn); } });
    cmds.push({ group: t("cmdk.actions"), title: t("events.clear"), icon: "trash", kw: "limpar clear interacoes", run: function () { gotoTab("events"); clearEvents(); } });
    if (window.I18N) window.I18N.langs.forEach(function (l) { cmds.push({ group: t("cmdk.language"), title: t("lang." + l), icon: "globe", kw: "idioma language " + l, run: function () { window.I18N.setLang(l); } }); });
    return cmds;
  }
  function openCmdk() {
    if (CMDK.open) return;
    CMDK.open = true; CMDK.items = buildCommands(); CMDK.active = 0;
    var ov = document.createElement("div"); ov.className = "cmdk-overlay"; ov.id = "cmdkOverlay";
    ov.innerHTML =
      '<div class="cmdk" role="dialog" aria-modal="true" aria-label="' + escAttr(t("cmdk.title")) + '">' +
        '<div class="cmdk-input-wrap">' + icon("search") + '<input id="cmdkInput" type="text" placeholder="' + escAttr(t("cmdk.placeholder")) + '" autocomplete="off" />' + '<span class="kbd">Esc</span></div>' +
        '<div class="cmdk-list" id="cmdkList"></div>' +
      "</div>";
    document.body.appendChild(ov);
    CMDK.el = ov;
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) closeCmdk(); });
    var input = $("cmdkInput");
    input.addEventListener("input", function () { CMDK.active = 0; renderCmdkList(input.value); });
    input.addEventListener("keydown", cmdkKeydown);
    requestAnimationFrame(function () { ov.classList.add("open"); input.focus(); });
    renderCmdkList("");
  }
  function closeCmdk() {
    if (!CMDK.open || !CMDK.el) return;
    var el = CMDK.el; CMDK.open = false; CMDK.el = null;
    el.classList.remove("open");
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 160);
  }
  function cmdkFiltered(q) {
    q = (q || "").trim().toLowerCase();
    if (!q) return CMDK.items;
    return CMDK.items.filter(function (c) { return (c.title + " " + (c.kw || "") + " " + c.group).toLowerCase().indexOf(q) >= 0; });
  }
  function renderCmdkList(q) {
    var box = $("cmdkList"); if (!box) return;
    var list = cmdkFiltered(q); CMDK._list = list;
    if (!list.length) { box.innerHTML = '<div class="cmdk-empty">' + esc(t("cmdk.empty")) + "</div>"; return; }
    if (CMDK.active >= list.length) CMDK.active = list.length - 1;
    var html = "", lastGroup = null;
    list.forEach(function (c, i) {
      if (c.group !== lastGroup) { html += '<div class="cmdk-group-label">' + esc(c.group) + "</div>"; lastGroup = c.group; }
      html += '<div class="cmdk-item' + (i === CMDK.active ? " active" : "") + '" data-i="' + i + '"><span class="ci-ico">' + icon(c.icon) + '</span><div class="ci-body"><div class="ci-title">' + esc(c.title) + "</div></div></div>";
    });
    box.innerHTML = html;
    Array.prototype.forEach.call(box.querySelectorAll(".cmdk-item"), function (it) {
      it.addEventListener("mousemove", function () { CMDK.active = Number(it.getAttribute("data-i")); paintActive(); });
      it.addEventListener("click", function () { runCmdk(Number(it.getAttribute("data-i"))); });
    });
  }
  function paintActive() {
    var box = $("cmdkList"); if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll(".cmdk-item"), function (it) {
      var on = Number(it.getAttribute("data-i")) === CMDK.active;
      it.classList.toggle("active", on);
      if (on && it.scrollIntoView) it.scrollIntoView({ block: "nearest" });
    });
  }
  function runCmdk(i) { var c = (CMDK._list || [])[i]; closeCmdk(); if (c && c.run) c.run(); }
  function cmdkKeydown(e) {
    var list = CMDK._list || [];
    if (e.key === "Escape") { e.preventDefault(); closeCmdk(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); CMDK.active = Math.min(list.length - 1, CMDK.active + 1); paintActive(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); CMDK.active = Math.max(0, CMDK.active - 1); paintActive(); }
    else if (e.key === "Enter") { e.preventDefault(); runCmdk(CMDK.active); }
  }

  // ── Evidence (App Review) ──────────────────────────────────
  var EV = { loaded: false, suites: [], apps: [], channels: [], lastDoc: "", lastFile: "" };
  function evShow(el, on) { if (el) el.style.display = on ? "" : "none"; }
  function evSuiteByKey(k) { for (var i = 0; i < EV.suites.length; i++) if (EV.suites[i].key === k) return EV.suites[i]; return null; }
  function evidenceOnShow() {
    var run = $("evRun");
    if (run && !run._wired) {
      run._wired = true;
      run.addEventListener("click", evRun);
      $("evDownload").addEventListener("click", evDownloadDoc);
      $("evApp").addEventListener("change", evToggleSource);
      $("evProduct").addEventListener("change", evRenderParams);
      $("evSource").addEventListener("change", evToggleSource);
      $("evWrites").addEventListener("change", evToggleSource);
    }
    var jobs = [api("/api/apps"), api("/api/channels")];
    if (!EV.loaded) jobs.push(api("/api/evidence/suites"));
    Promise.all(jobs).then(function (r) {
      EV.apps = (r[0] && r[0].apps) || []; EV.channels = (r[1] && r[1].channels) || [];
      if (!EV.loaded) { EV.suites = (r[2] && r[2].suites) || []; EV.loaded = true; }
      evPopulate();
    }).catch(function (e) { toast(e.message, true); });
  }
  function evPopulate() {
    $("evApp").innerHTML = EV.apps.map(function (a) { return '<option value="' + escAttr(a.id) + '">' + esc(a.name) + "</option>"; }).join("");
    $("evProduct").innerHTML = EV.suites.map(function (s) { return '<option value="' + escAttr(s.key) + '">' + esc(s.label) + "</option>"; }).join("");
    var srcSel = $("evSource");
    if (!srcSel.options.length) srcSel.innerHTML = ["fallback", "channel", "paste"].map(function (v) { return '<option value="' + v + '">' + esc(t("evidence.src." + v)) + "</option>"; }).join("");
    evRenderParams(); evToggleSource();
  }
  function evChannelsForApp() { var id = $("evApp").value; return EV.channels.filter(function (c) { return c.appId === id; }); }
  function evToggleSource() {
    var src = $("evSource").value;
    evShow($("evChannelWrap"), src === "channel"); evShow($("evTokenWrap"), src === "paste");
    if (src === "channel") $("evChannel").innerHTML = evChannelsForApp().map(function (c) { return '<option value="' + escAttr(c.id) + '">' + esc((c.type || "") + " · " + (c.name || c.externalId)) + "</option>"; }).join("");
    var pv = $("evProduct").value;
    evShow($("evRecipientWrap"), $("evWrites").checked && (pv === "whatsapp" || pv === "messenger"));
  }
  function evRenderParams() {
    var p = evSuiteByKey($("evProduct").value), box = $("evParams");
    if (!p) { box.innerHTML = ""; return; }
    var labels = { waba_id: "WABA ID", phone_number_id: "Phone Number ID", ig_id: "Instagram ID", page_id: "Page ID" };
    box.innerHTML = (p.needs || []).map(function (n) { return '<div class="field"><label for="evp_' + n + '">' + esc(labels[n] || n) + '</label><input id="evp_' + n + '" data-param="' + n + '" placeholder="' + escAttr(t("evidence.autoFill")) + '" /></div>'; }).join("");
    evToggleSource();
  }
  function evCollectParams() {
    var o = {};
    Array.prototype.forEach.call(document.querySelectorAll("#evParams [data-param]"), function (i) { if (i.value.trim()) o[i.getAttribute("data-param")] = i.value.trim(); });
    var r = $("evRecipient"); if (r && r.value.trim()) o.recipient = r.value.trim();
    return o;
  }
  function evRun() {
    var body = { appId: $("evApp").value, product: $("evProduct").value, source: $("evSource").value, allowWrites: $("evWrites").checked, params: evCollectParams() };
    if (body.source === "channel") body.channelId = $("evChannel").value;
    if (body.source === "paste") body.token = $("evToken").value.trim();
    if (!body.appId) { toast(t("evidence.pickApp"), true); return; }
    $("evRun").disabled = true; $("evSummary").textContent = t("common.loading"); $("evResults").innerHTML = ""; $("evDownload").style.display = "none";
    api("/api/evidence/run", { method: "POST", body: body }).then(function (d) {
      EV.lastDoc = d.doc || ""; EV.lastFile = d.filename || "evidencia.txt";
      $("evSummary").textContent = t("evidence.summary", { ok: d.summary.ok, total: d.summary.total, fail: d.summary.fail });
      $("evDownload").style.display = EV.lastDoc ? "inline-flex" : "none";
      evRenderResults(d.records || []);
    }).catch(function (e) { $("evSummary").textContent = ""; toast(e.message, true); }).then(function () { $("evRun").disabled = false; });
  }
  function evRenderResults(records) {
    $("evResults").innerHTML = records.map(function (r) {
      var cls = r.skipped ? "warn" : (r.ok ? "ok" : "bad"), st = r.skipped ? "—" : "HTTP " + r.status;
      var resp = typeof r.response === "string" ? r.response : JSON.stringify(r.response, null, 2);
      return '<div class="ev-row"><div class="ev-head"><span class="ev-badge ' + cls + '">' + esc(st) + "</span> <b>" + esc(r.label) + '</b> <span class="ev-group">' + esc(r.group) + "</span></div>" +
        (r.traceId ? '<div class="ev-trace">trace ' + esc(r.traceId) + (r.requestId ? " · req " + esc(r.requestId) : "") + "</div>" : "") +
        "<details><summary>" + esc(t("events.payload")) + "</summary><pre>" + esc(resp) + "</pre></details></div>";
    }).join("");
  }
  function evDownloadDoc() {
    if (!EV.lastDoc) return;
    var blob = new Blob([EV.lastDoc], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = EV.lastFile;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }

  // ── Wire up ────────────────────────────────────────────────
  var resizeTimer = null;
  document.addEventListener("DOMContentLoaded", function () {
    if (window.I18N) window.I18N.applyI18n(document);
    buildLangSwitcher(); initVideoLightbox(); initVideoThumbs();
    document.addEventListener("click", function (e) {
      var dd = $("langDD");
      if (dd && dd.classList.contains("open") && (!e.target.closest || !e.target.closest("#langDD"))) closeLangMenu();
    });
    applyPromo(); setPageTitle();
    var isMac = /Mac|iPhone|iPad/.test(navigator.platform || "");
    var hint = $("cmdkHint"); if (hint) hint.textContent = isMac ? "⌘ K" : "Ctrl K";
    window.addEventListener("i18n:changed", onLangChanged);
    setupTabs();
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
    setSoundUI(); setLiveUI();
    $("loginForm").addEventListener("submit", function (e) { e.preventDefault(); doLogin(); });
    $("logoutBtn").addEventListener("click", doLogout);
    $("themeBtn").addEventListener("click", toggleTheme);
    $("saveSettings").addEventListener("click", saveSettings);
    $("newAppBtn").addEventListener("click", function () { openAppForm(null); });
    $("connectBtn").addEventListener("click", openConnectDrawer);
    $("cmdkBtn").addEventListener("click", openCmdk);
    var welcomeEnterBtn = $("welcomeEnter"); if (welcomeEnterBtn) welcomeEnterBtn.addEventListener("click", dismissWelcome);
    var brandHomeBtn = $("brandHome"); if (brandHomeBtn) brandHomeBtn.addEventListener("click", openWelcome);
    $("ovSeeConsole").addEventListener("click", function () { gotoTab("events"); });
    $("liveToggle").addEventListener("click", function () { setLive(!liveOn); });
    $("soundToggle").addEventListener("click", function () { setSound(!soundOn); });
    $("refreshEvents").addEventListener("click", function () { fetchEvents(true); });
    $("clearEvents").addEventListener("click", clearEvents);
    ["evtSearch", "evtApp", "evtProduct"].forEach(function (id) { var el = $(id); if (el) { el.addEventListener("input", onEvtFilter); el.addEventListener("change", onEvtFilter); } });
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); if (CMDK.open) closeCmdk(); else openCmdk(); }
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest) return;
      var tb = e.target.closest("[data-embed-test]");
      if (tb) { var w = window.open(tb.getAttribute("data-embed-test"), "iw_connect", "width=560,height=740"); if (!w) toast(t("embed.popupBlocked"), true); return; }
      var b = e.target.closest("[data-copy-text]");
      if (b) navigator.clipboard.writeText(b.getAttribute("data-copy-text")).then(function () { toast(t("toast.copied")); }, function () { toast(t("toast.copyFail"), true); });
    });
    window.addEventListener("resize", function () { if (resizeTimer) clearTimeout(resizeTimer); resizeTimer = setTimeout(function () { if (currentTab() === "overview") renderOverview(); }, 200); });
    bootstrap();
  });
})();
