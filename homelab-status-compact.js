/*
 * Homelab Status Compact
 * Platzsparende Statusübersicht: ein Banner fasst alle überwachten Container/VMs
 * (z. B. aus der Proxmox-VE-Integration) samt Domain-Erreichbarkeit zusammen,
 * darunter optional die wichtigsten Dienste als kleine Chips.
 */
const VERSION = "1.1.0";
const CHECK_SERVICE = "homelab_status_check";

const I18N = {
  de: {
    all_ok: "Alles in Betrieb",
    problems_one: "1 Problem",
    problems_many: "{n} Probleme",
    no_services: "Keine Dienste ausgewählt",
    running: "In Betrieb",
    offline: "Offline",
    unavailable: "Nicht verfügbar",
    domain_down: "Domain nicht erreichbar",
    domain_ok: "Domain erreichbar",
    domain_unknown: "Domain wird geprüft…",
    domain_short: "Domain",
    general: "Allgemein",
    title: "Name der Karte (optional, z. B. feprox)",
    interval: "Prüfintervall (Sekunden)",
    base_domain: "Basis-Domain (z. B. example.org)",
    expand_problems: "Probleme automatisch aufklappen",
    services: "Überwachte Dienste",
    services_hint: "Alle angehakten Dienste fließen in den Banner ein. Mit „Als Chip anzeigen“ erscheinen die wichtigsten zusätzlich einzeln darunter.",
    show_all: "Alle Binärsensoren anzeigen (nicht nur *_status)",
    name: "Anzeigename",
    icon: "Icon",
    pinned: "Als Chip anzeigen",
    domain_check: "Domain überwachen",
    domain: "Domain oder URL",
    no_entities: "Keine passenden Entitäten gefunden.",
    search: "Dienste durchsuchen …",
    search_count: "{shown} von {total}",
    search_none: "Keine Treffer für diese Suche.",
    selected_count: "{sel} überwacht · {pin} als Chip",
    nodes: "Nodes:",
    node_other: "Andere",
    up: "Nach oben",
    down: "Nach unten",
    browser_mode:
      "Hinweis: Der Dienst shell_command.homelab_status_check fehlt. Die Domain wird daher vom Browser geprüft (nur „erreichbar ja/nein“, keine HTTP-Fehler wie 502). Für die serverseitige Prüfung siehe README.",
  },
  en: {
    all_ok: "All systems running",
    problems_one: "1 problem",
    problems_many: "{n} problems",
    no_services: "No services selected",
    running: "Running",
    offline: "Offline",
    unavailable: "Unavailable",
    domain_down: "Domain unreachable",
    domain_ok: "Domain reachable",
    domain_unknown: "Checking domain…",
    domain_short: "Domain",
    general: "General",
    title: "Card name (optional, e.g. feprox)",
    interval: "Check interval (seconds)",
    base_domain: "Base domain (e.g. example.org)",
    expand_problems: "Expand problems automatically",
    services: "Monitored services",
    services_hint: "All checked services feed into the banner. Use “Show as chip” to also show the most important ones individually below it.",
    show_all: "Show all binary sensors (not only *_status)",
    name: "Display name",
    icon: "Icon",
    pinned: "Show as chip",
    domain_check: "Monitor domain",
    domain: "Domain or URL",
    no_entities: "No matching entities found.",
    search: "Search services …",
    search_count: "{shown} of {total}",
    search_none: "No services match this search.",
    selected_count: "{sel} monitored · {pin} as chip",
    nodes: "Nodes:",
    node_other: "Other",
    up: "Move up",
    down: "Move down",
    browser_mode:
      "Note: the service shell_command.homelab_status_check is missing, so the domain is checked by the browser (reachable yes/no only, no HTTP errors like 502). See the README for server-side checks.",
  },
};

const t = (hass, key) => {
  const lang = String(hass?.language || "en").split("-")[0];
  return (I18N[lang] || I18N.en)[key] ?? I18N.en[key] ?? key;
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const normalizeUrl = (d) => {
  d = String(d || "").trim();
  if (!d) return "";
  return /^https?:\/\//i.test(d) ? d : `https://${d}`;
};

const COLORS = {
  ok: "76, 175, 80",
  down: "244, 67, 54",
  warn: "255, 152, 0",
  unknown: "158, 158, 158",
};

// ---------------------------------------------------------------------------
// Domain-Prüfung. Der Cache liegt global, damit sich diese Karte und die
// Homelab Status Card dieselben Ergebnisse teilen und jede URL nur einmal prüfen.
// ---------------------------------------------------------------------------
const checks = (window.__homelabStatusChecks = window.__homelabStatusChecks || new Map());

const hasServerCheck = (hass) => !!hass?.services?.shell_command?.[CHECK_SERVICE];

async function runCheck(hass, url) {
  if (hasServerCheck(hass)) {
    try {
      const res = await hass.callWS({
        type: "call_service",
        domain: "shell_command",
        service: CHECK_SERVICE,
        service_data: { url },
        return_response: true,
      });
      const code = parseInt(String(res?.response?.stdout ?? "").trim(), 10) || 0;
      return { ok: code > 0 && code < 500, code, method: "server" };
    } catch (err) {
      console.warn("homelab-status-compact: Prüfung fehlgeschlagen", url, err);
      return { ok: null, code: null, method: "server" };
    }
  }
  // Fallback: Prüfung aus dem Browser. Wegen CORS ist nur „erreichbar ja/nein“ sichtbar.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    await fetch(url, { mode: "no-cors", cache: "no-store", signal: ctrl.signal });
    return { ok: true, code: null, method: "browser" };
  } catch (_err) {
    return { ok: false, code: 0, method: "browser" };
  } finally {
    clearTimeout(timer);
  }
}

function requestCheck(hass, url, maxAgeMs) {
  const entry = checks.get(url) || { ok: undefined, ts: 0, promise: null };
  if (entry.promise || Date.now() - entry.ts < maxAgeMs) return entry;
  entry.promise = runCheck(hass, url).then((res) => {
    Object.assign(entry, res, { ts: Date.now(), promise: null });
    return entry;
  });
  checks.set(url, entry);
  return entry;
}

// ---------------------------------------------------------------------------
// Karte
// ---------------------------------------------------------------------------
const CARD_STYLE = `
  :host { display: block; }
  ha-card { overflow: hidden; }
  .banner {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; min-height: 24px;
    background: rgba(var(--c), 0.14);
    border-left: 4px solid rgb(var(--c));
  }
  .banner.clickable { cursor: pointer; }
  .banner > ha-icon { --mdc-icon-size: 22px; color: rgb(var(--c)); display: flex; flex: none; }
  .btext { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; }
  .bname {
    font-weight: 700; font-size: 14px; color: var(--primary-text-color); white-space: nowrap;
    padding-right: 8px; border-right: 1px solid var(--divider-color, rgba(0,0,0,0.2));
    overflow: hidden; text-overflow: ellipsis; max-width: 40%; flex: none;
  }
  .btitle { font-weight: 600; font-size: 14px; color: var(--primary-text-color); white-space: nowrap; }
  .bsub {
    font-size: 12px; color: var(--secondary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
  }
  .chev { --mdc-icon-size: 20px; color: var(--secondary-text-color); display: flex; flex: none; transition: transform 0.2s; }
  .chev.open { transform: rotate(180deg); }

  .plist { padding: 4px 12px 8px 16px; border-top: 1px solid var(--divider-color, rgba(0,0,0,0.12)); }
  .prow { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 13px; cursor: pointer; }
  .prow + .prow { border-top: 1px solid var(--divider-color, rgba(0,0,0,0.06)); }
  .prow .pname { font-weight: 500; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .prow .preason { color: rgb(var(--c)); white-space: nowrap; margin-left: auto; padding-left: 8px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; background: rgb(var(--c)); }

  .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 10px 10px; }
  .chips.alone { padding-top: 10px; }
  .chip {
    display: inline-flex; align-items: center; gap: 6px; max-width: 100%;
    padding: 4px 10px 4px 8px; border-radius: 14px; cursor: pointer; box-sizing: border-box;
    font-size: 12px; line-height: 16px; color: var(--primary-text-color);
    background: var(--secondary-background-color, rgba(127,127,127,0.12));
    border: 1px solid transparent;
  }
  .chip.bad { background: rgba(var(--c), 0.14); border-color: rgba(var(--c), 0.5); }
  .chip .cname { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .chip ha-icon.cicon { --mdc-icon-size: 14px; color: rgb(var(--c)); display: flex; flex: none; }
  .web {
    display: inline-flex; align-items: center; justify-content: center; flex: none;
    width: 16px; height: 16px; border-radius: 50%; background: rgb(var(--b)); margin-right: -4px;
  }
  .web ha-icon { --mdc-icon-size: 11px; color: #fff; display: flex; }
`;

class HomelabStatusCompact extends HTMLElement {
  static getConfigElement() {
    return document.createElement("homelab-status-compact-editor");
  }

  static getStubConfig(hass) {
    const entities = Object.keys(hass.states)
      .filter((id) => id.startsWith("binary_sensor.") && id.endsWith("_status"))
      .slice(0, 4);
    return { services: entities.map((entity, i) => (i < 2 ? { entity, pinned: true } : { entity })) };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._userOpen = null; // null = automatisch (expand_problems), sonst Wahl des Nutzers
    this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.services)) {
      throw new Error("'services' muss eine Liste sein");
    }
    for (const s of config.services) {
      if (!s || !s.entity) throw new Error("Jeder Dienst braucht eine 'entity'");
    }
    this._config = { interval: 60, ...config };
    this._stopTimer();
    if (this.isConnected) this._startTimer();
    this._render();
  }

  set hass(hass) {
    const old = this._hass;
    this._hass = hass;
    if (!this._config) return;
    if (!old) {
      this._runChecks();
      this._render();
      return;
    }
    if (this._config.services.some((s) => old.states[s.entity] !== hass.states[s.entity])) {
      this._render();
    }
  }

  connectedCallback() {
    this._startTimer();
  }

  disconnectedCallback() {
    this._stopTimer();
  }

  getCardSize() {
    const pinned = this._config?.services.filter((s) => s.pinned).length || 0;
    return 1 + Math.ceil(pinned / 4) + (this._isOpen() ? this._problems().length : 0);
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  get _intervalMs() {
    return Math.max(15, Number(this._config?.interval) || 60) * 1000;
  }

  _startTimer() {
    if (this._timer || !this._config) return;
    this._timer = setInterval(() => this._runChecks(), this._intervalMs);
    this._runChecks();
  }

  _stopTimer() {
    clearInterval(this._timer);
    this._timer = null;
  }

  _runChecks() {
    if (!this._hass || !this._config) return;
    for (const s of this._config.services) {
      if (!s.domain_check || !s.domain) continue;
      const entry = requestCheck(this._hass, normalizeUrl(s.domain), this._intervalMs - 2000);
      if (entry.promise) entry.promise.then(() => this._render());
    }
  }

  // Zustand eines Dienstes: Container (main) und Domain (dom) getrennt
  _state(s) {
    const st = this._hass.states[s.entity];
    const name = s.name || st?.attributes?.friendly_name || s.entity;
    const main = !st || ["unavailable", "unknown"].includes(st.state) ? "unknown" : st.state === "on" ? "ok" : "down";
    let dom = null;
    let code = null;
    let url = "";
    if (s.domain_check && s.domain) {
      url = normalizeUrl(s.domain);
      const entry = checks.get(url);
      dom = entry?.ok === true ? "ok" : entry?.ok === false ? "down" : "unknown";
      code = entry?.code;
    }
    // Schwere: Container weg = rot, nur Domain weg = orange
    let sev = "ok";
    let reason = t(this._hass, "running");
    if (main === "down") {
      sev = "down";
      reason = t(this._hass, "offline");
    } else if (main === "unknown") {
      sev = "down";
      reason = t(this._hass, "unavailable");
    } else if (dom === "down") {
      sev = "warn";
      reason = t(this._hass, "domain_down") + (code ? ` (HTTP ${code})` : "");
    }
    return { name, main, dom, code, url, sev, reason };
  }

  _problems() {
    if (!this._hass || !this._config) return [];
    return this._config.services
      .map((s) => ({ s, ...this._state(s) }))
      .filter((x) => x.sev !== "ok")
      .sort((a, b) => (a.sev === b.sev ? 0 : a.sev === "down" ? -1 : 1));
  }

  _isOpen() {
    if (this._userOpen !== null) return this._userOpen;
    return !!this._config?.expand_problems && this._problems().length > 0;
  }

  _onClick(ev) {
    const web = ev.target.closest("[data-url]");
    if (web) {
      ev.stopPropagation();
      window.open(web.dataset.url, "_blank", "noopener");
      return;
    }
    const target = ev.target.closest("[data-entity]");
    if (target) {
      this.dispatchEvent(
        new CustomEvent("hass-more-info", { detail: { entityId: target.dataset.entity }, bubbles: true, composed: true })
      );
      return;
    }
    if (ev.target.closest(".banner.clickable")) {
      this._userOpen = !this._isOpen();
      this._render();
    }
  }

  _banner(problems, total) {
    const hass = this._hass;
    const name = this._config.title ? `<span class="bname" title="${esc(this._config.title)}">${esc(this._config.title)}</span>` : "";
    if (!total) {
      return `<div class="banner" style="--c: ${COLORS.unknown}">
          <ha-icon icon="mdi:information-outline"></ha-icon>
          <div class="btext">${name}<span class="btitle">${t(hass, "no_services")}</span></div>
        </div>`;
    }
    if (!problems.length) {
      return `<div class="banner" style="--c: ${COLORS.ok}">
          <ha-icon icon="mdi:check-circle"></ha-icon>
          <div class="btext">
            ${name}
            <span class="btitle">${t(hass, "all_ok")}</span>
            <span class="bsub">${total}/${total}</span>
          </div>
        </div>`;
    }
    const sev = problems.some((p) => p.sev === "down") ? "down" : "warn";
    const title = problems.length === 1 ? t(hass, "problems_one") : t(hass, "problems_many").replace("{n}", problems.length);
    const summary = problems
      .map((p) => `${p.name} ${p.sev === "warn" ? t(hass, "domain_short") + (p.code ? ` ${p.code}` : "") : p.reason.toLowerCase()}`)
      .join(" · ");
    const open = this._isOpen();
    return `<div class="banner clickable" style="--c: ${COLORS[sev]}" title="${esc(summary)}">
        <ha-icon icon="mdi:alert-circle"></ha-icon>
        <div class="btext">
          ${name}
          <span class="btitle">${esc(title)}</span>
          <span class="bsub">${esc(summary)}</span>
        </div>
        <ha-icon class="chev${open ? " open" : ""}" icon="mdi:chevron-down"></ha-icon>
      </div>`;
  }

  _problemList(problems) {
    return `<div class="plist">
        ${problems
          .map(
            (p) => `<div class="prow" data-entity="${esc(p.s.entity)}" style="--c: ${COLORS[p.sev]}">
              <span class="dot"></span>
              <span class="pname">${esc(p.name)}</span>
              <span class="preason">${esc(p.reason)}</span>
              ${
                p.url
                  ? `<span class="web" data-url="${esc(p.url)}" title="${esc(p.url)}" style="--b: ${COLORS[p.dom || "unknown"]}"><ha-icon icon="mdi:web"></ha-icon></span>`
                  : ""
              }
            </div>`
          )
          .join("")}
      </div>`;
  }

  _chip(s) {
    const hass = this._hass;
    const x = this._state(s);
    const color = COLORS[x.main === "ok" ? "ok" : x.main === "down" ? "down" : "unknown"];
    let tip = `${x.name} – ${x.reason}`;
    let web = "";
    if (x.url) {
      const label = x.dom === "ok" ? t(hass, "domain_ok") : x.dom === "down" ? t(hass, "domain_down") : t(hass, "domain_unknown");
      tip += `\n${x.url} – ${label}${x.code ? ` (HTTP ${x.code})` : ""}`;
      web = `<span class="web" data-url="${esc(x.url)}" title="${esc(x.url)}" style="--b: ${COLORS[x.dom]}"><ha-icon icon="mdi:web"></ha-icon></span>`;
    }
    return `<div class="chip${x.sev === "ok" ? "" : " bad"}" data-entity="${esc(s.entity)}" title="${esc(tip)}" style="--c: ${COLORS[x.sev === "ok" ? "ok" : x.sev]}">
        <ha-icon class="cicon" style="--c: ${color}" icon="${esc(s.icon || "mdi:circle")}"></ha-icon>
        <span class="cname">${esc(x.name)}</span>
        ${web}
      </div>`;
  }

  _render() {
    if (!this._config || !this._hass) return;
    const services = this._config.services;
    const problems = this._problems();
    if (!problems.length) this._userOpen = null; // nach Behebung wieder automatisch
    const pinned = services.filter((s) => s.pinned);
    const open = this._isOpen() && problems.length > 0;
    this.shadowRoot.innerHTML = `
      <style>${CARD_STYLE}</style>
      <ha-card>
        ${this._banner(problems, services.length)}
        ${open ? this._problemList(problems) : ""}
        ${pinned.length ? `<div class="chips">${pinned.map((s) => this._chip(s)).join("")}</div>` : ""}
      </ha-card>`;
  }
}

// ---------------------------------------------------------------------------
// Visueller Editor
// ---------------------------------------------------------------------------
const EDITOR_STYLE = `
  :host { display: block; }
  h3 { margin: 16px 0 8px; font-size: 16px; font-weight: 500; }
  .hint { font-size: 12px; color: var(--secondary-text-color); margin: -4px 0 10px; }
  label.field { display: block; margin-bottom: 10px; font-size: 12px; color: var(--secondary-text-color); }
  input[type=text], input[type=number], input[type=search], select {
    display: block; width: 100%; box-sizing: border-box; margin-top: 4px;
    padding: 8px 10px; font-size: 14px; border-radius: 6px;
    border: 1px solid var(--divider-color, #ccc);
    background: var(--card-background-color, #fff); color: var(--primary-text-color);
  }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .check { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
  .check input { width: 18px; height: 18px; margin: 0; accent-color: var(--primary-color); }
  .checks { display: flex; flex-wrap: wrap; gap: 6px 18px; }
  .svc { border: 1px solid var(--divider-color, #ddd); border-radius: 8px; padding: 8px 10px; margin-bottom: 6px; }
  .svc.on { border-color: var(--primary-color); }
  .svc.hidden { display: none; }
  .search { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .search input { flex: 1; margin-top: 0; }
  .search .count { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; }
  .nodes { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: -2px 0 10px; font-size: 12px; color: var(--secondary-text-color); }
  .chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px 3px 6px; border-radius: 14px; cursor: pointer; border: 1px solid var(--divider-color, #ccc); color: var(--primary-text-color); font-size: 13px; }
  .chip.on { border-color: var(--primary-color); background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.12); }
  .chip input { margin: 0; }
  .search-none { display: none; font-size: 13px; color: var(--secondary-text-color); margin-bottom: 8px; }
  .search-none.show { display: block; }
  .svc-head { display: flex; align-items: center; gap: 8px; }
  .svc-head .check { flex: 1; min-width: 0; }
  .svc-head .eid { font-size: 11px; color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pin { font-size: 11px; padding: 1px 6px; border-radius: 8px; background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.15); color: var(--primary-color); white-space: nowrap; }
  .svc-body { margin: 10px 0 2px 26px; }
  button.mv {
    border: none; background: none; cursor: pointer; padding: 4px;
    color: var(--secondary-text-color); font-size: 16px; line-height: 1;
  }
  button.mv:disabled { opacity: 0.3; cursor: default; }
  .note {
    font-size: 12px; padding: 8px 10px; border-radius: 6px; margin-bottom: 12px;
    background: rgba(${COLORS.warn}, 0.15); color: var(--primary-text-color);
  }
`;

const slugFor = (svc) => {
  if (svc.name) return svc.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return svc.entity
    .replace(/^binary_sensor\./, "")
    .replace(/^(lxc|qemu|vm|ct)_/, "")
    .replace(/(_\d+)?_status$/, "")
    .replace(/_/g, "-");
};

class HomelabStatusCompactEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._showAll = false;
    this._query = "";
    this._hiddenNodes = new Set();
    this.shadowRoot.addEventListener("input", (ev) => this._onInput(ev));
    this.shadowRoot.addEventListener("change", (ev) => this._onChange(ev));
    this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
  }

  setConfig(config) {
    const json = JSON.stringify(config);
    if (json === this._lastJson) return; // eigenes Echo: nicht neu rendern (Fokus bleibt erhalten)
    this._lastJson = json;
    this._config = JSON.parse(json);
    if (!Array.isArray(this._config.services)) this._config.services = [];
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._render();
  }

  _fire() {
    const config = JSON.parse(JSON.stringify(this._config));
    this._lastJson = JSON.stringify(config);
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }

  _svc(entity) {
    return this._config.services.find((s) => s.entity === entity);
  }

  _setTop(key, value) {
    if (value === "" || value === null || Number.isNaN(value) || value === false) delete this._config[key];
    else this._config[key] = value;
  }

  _onInput(ev) {
    const el = ev.target;
    if (el.dataset.act === "search") {
      this._query = el.value;
      this._applySearch();
      return;
    }
    const field = el.dataset.field;
    if (!field || el.type === "checkbox") return;
    if (el.dataset.entity) {
      const s = this._svc(el.dataset.entity);
      if (!s) return;
      if (el.value.trim() === "") delete s[field];
      else s[field] = el.value.trim();
    } else {
      this._setTop(field, el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value);
    }
    this._fire();
  }

  _onChange(ev) {
    const el = ev.target;
    const act = el.dataset.act;
    if (!act || act === "search") return;
    if (act === "node") {
      if (el.checked) this._hiddenNodes.delete(el.dataset.node);
      else this._hiddenNodes.add(el.dataset.node);
      el.closest(".chip")?.classList.toggle("on", el.checked);
      this._applySearch();
      return;
    }
    if (act === "show_all") {
      this._showAll = el.checked;
      this._render();
      return;
    }
    if (act === "top_flag") {
      this._setTop(el.dataset.key, el.checked);
      this._fire();
      return;
    }
    const entity = el.dataset.entity;
    const s = this._svc(entity);
    if (act === "toggle") {
      if (el.checked) {
        if (!s) this._config.services.push({ entity });
      } else {
        this._config.services = this._config.services.filter((x) => x.entity !== entity);
      }
    } else if (act === "pinned") {
      if (!s) return;
      if (el.checked) s.pinned = true;
      else delete s.pinned;
    } else if (act === "domain_check") {
      if (!s) return;
      if (el.checked) {
        s.domain_check = true;
        if (!s.domain && this._config.base_domain) {
          s.domain = `${slugFor(s)}.${String(this._config.base_domain).replace(/^\./, "")}`;
        }
      } else {
        delete s.domain_check;
      }
    }
    this._render();
    this._fire();
  }

  _onClick(ev) {
    const btn = ev.target.closest("button.mv");
    if (!btn) return;
    const list = this._config.services;
    const i = list.findIndex((s) => s.entity === btn.dataset.entity);
    const j = i + (btn.dataset.dir === "up" ? -1 : 1);
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this._render();
    this._fire();
  }

  // Node über die Geräte-Registry: Container/VM-Gerät -> via_device (Node). Nur für die Proxmox-Integration.
  _nodeOf(id) {
    const hass = this._hass;
    const ent = hass.entities?.[id];
    if (!ent || ent.platform !== "proxmoxve") return "";
    const dev = hass.devices?.[ent.device_id];
    if (!dev) return "";
    const node = (dev.via_device_id && hass.devices?.[dev.via_device_id]) || dev;
    return String(node.name_by_user || node.name || "").replace(/^Node\s+/i, "");
  }

  _matches(hay) {
    const words = this._query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return words.every((w) => hay.includes(w));
  }

  // Filtert ohne Neu-Rendern, damit der Fokus im Suchfeld bleibt
  _applySearch() {
    const root = this.shadowRoot;
    const rows = [...root.querySelectorAll(".svc")];
    let shown = 0;
    for (const row of rows) {
      const hit = this._matches(row.dataset.search || "") && !this._hiddenNodes.has(row.dataset.node || "");
      row.classList.toggle("hidden", !hit);
      if (hit) shown++;
    }
    const count = root.querySelector(".search .count");
    if (count) {
      count.textContent =
        this._query.trim() || this._hiddenNodes.size
          ? t(this._hass, "search_count").replace("{shown}", shown).replace("{total}", rows.length)
          : "";
    }
    root.querySelector(".search-none")?.classList.toggle("show", rows.length > 0 && shown === 0);
  }

  _nodesBar() {
    const hass = this._hass;
    const nodes = [...new Set(this._candidates().map((id) => this._nodeOf(id)))].sort((a, b) =>
      a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)
    );
    if (nodes.length < 2 && !this._hiddenNodes.size) return "";
    const chips = nodes
      .map((n) => {
        const on = !this._hiddenNodes.has(n);
        return `<label class="chip${on ? " on" : ""}">
            <input type="checkbox" data-act="node" data-node="${esc(n)}" ${on ? "checked" : ""}>
            ${esc(n || t(hass, "node_other"))}
          </label>`;
      })
      .join("");
    return `<div class="nodes">${t(hass, "nodes")} ${chips}</div>`;
  }

  _candidates() {
    const hass = this._hass;
    const selected = this._config.services.map((s) => s.entity);
    const others = Object.keys(hass.states)
      .filter((id) => id.startsWith("binary_sensor.") && (this._showAll || id.endsWith("_status")))
      .filter((id) => !selected.includes(id))
      .sort((a, b) =>
        String(hass.states[a].attributes.friendly_name || a).localeCompare(String(hass.states[b].attributes.friendly_name || b))
      );
    return [...selected, ...others];
  }

  _render() {
    if (!this._config || !this._hass) return;
    const hass = this._hass;
    const c = this._config;
    const n = c.services.length;

    const rows = this._candidates()
      .map((id) => {
        const s = this._svc(id);
        const idx = c.services.indexOf(s);
        const fname = hass.states[id]?.attributes?.friendly_name || id;
        const body = s
          ? `<div class="svc-body">
              <div class="row2">
                <label class="field">${t(hass, "name")}
                  <input type="text" data-entity="${esc(id)}" data-field="name" value="${esc(s.name || "")}" placeholder="${esc(fname)}">
                </label>
                <label class="field">${t(hass, "icon")}
                  <input type="text" data-entity="${esc(id)}" data-field="icon" value="${esc(s.icon || "")}" placeholder="mdi:circle">
                </label>
              </div>
              <div class="checks">
                <label class="check">
                  <input type="checkbox" data-act="pinned" data-entity="${esc(id)}" ${s.pinned ? "checked" : ""}>
                  ${t(hass, "pinned")}
                </label>
                <label class="check">
                  <input type="checkbox" data-act="domain_check" data-entity="${esc(id)}" ${s.domain_check ? "checked" : ""}>
                  ${t(hass, "domain_check")}
                </label>
              </div>
              ${
                s.domain_check
                  ? `<label class="field" style="margin-top:8px">${t(hass, "domain")}
                      <input type="text" data-entity="${esc(id)}" data-field="domain" value="${esc(s.domain || "")}" placeholder="dienst.example.org">
                    </label>`
                  : ""
              }
            </div>`
          : "";
        const node = this._nodeOf(id);
        const hay = [fname, id, s?.name, s?.domain, node].filter(Boolean).join(" ").toLowerCase();
        const hidden = (this._query.trim() && !this._matches(hay)) || this._hiddenNodes.has(node) ? " hidden" : "";
        return `<div class="svc${s ? " on" : ""}${hidden}" data-search="${esc(hay)}" data-node="${esc(node)}">
            <div class="svc-head">
              <label class="check">
                <input type="checkbox" data-act="toggle" data-entity="${esc(id)}" ${s ? "checked" : ""}>
                <span style="min-width:0">
                  <div>${esc(s?.name || fname)}</div>
                  <div class="eid">${esc(id)}</div>
                </span>
              </label>
              ${s?.pinned ? `<span class="pin">Chip</span>` : ""}
              ${
                s
                  ? `<button class="mv" title="${t(hass, "up")}" data-entity="${esc(id)}" data-dir="up" ${idx === 0 ? "disabled" : ""}>▲</button>
                     <button class="mv" title="${t(hass, "down")}" data-entity="${esc(id)}" data-dir="down" ${idx === n - 1 ? "disabled" : ""}>▼</button>`
                  : ""
              }
            </div>
            ${body}
          </div>`;
      })
      .join("");

    const needsNote = c.services.some((s) => s.domain_check) && !hasServerCheck(hass);
    const pinnedCount = c.services.filter((s) => s.pinned).length;

    this.shadowRoot.innerHTML = `
      <style>${EDITOR_STYLE}</style>
      <h3>${t(hass, "general")}</h3>
      <label class="field">${t(hass, "title")}
        <input type="text" data-field="title" value="${esc(c.title || "")}" placeholder="feprox">
      </label>
      <div class="row2">
        <label class="field">${t(hass, "interval")}
          <input type="number" min="15" step="5" data-field="interval" value="${esc(c.interval ?? 60)}">
        </label>
        <label class="field">${t(hass, "base_domain")}
          <input type="text" data-field="base_domain" value="${esc(c.base_domain || "")}" placeholder="example.org">
        </label>
      </div>
      <label class="check">
        <input type="checkbox" data-act="top_flag" data-key="expand_problems" ${c.expand_problems ? "checked" : ""}>
        ${t(hass, "expand_problems")}
      </label>

      <h3>${t(hass, "services")}</h3>
      <div class="hint">${t(hass, "services_hint")}<br>${esc(
        t(hass, "selected_count").replace("{sel}", n).replace("{pin}", pinnedCount)
      )}</div>
      ${needsNote ? `<div class="note">${t(hass, "browser_mode")}</div>` : ""}
      <label class="check" style="margin-bottom:10px">
        <input type="checkbox" data-act="show_all" ${this._showAll ? "checked" : ""}>
        ${t(hass, "show_all")}
      </label>
      <div class="search">
        <input type="search" data-act="search" value="${esc(this._query)}" placeholder="${esc(t(hass, "search"))}" autocomplete="off">
        <span class="count"></span>
      </div>
      ${this._nodesBar()}
      <div class="search-none">${t(hass, "search_none")}</div>
      ${rows || `<div class="eid">${t(hass, "no_entities")}</div>`}
    `;
    this._applySearch();
  }
}

if (!customElements.get("homelab-status-compact")) {
  customElements.define("homelab-status-compact", HomelabStatusCompact);
}
if (!customElements.get("homelab-status-compact-editor")) {
  customElements.define("homelab-status-compact-editor", HomelabStatusCompactEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "homelab-status-compact")) {
  window.customCards.push({
    type: "homelab-status-compact",
    name: "Homelab Status Compact",
    description: "Ein Banner fasst alle Container/VMs und Domains zusammen, darunter die wichtigsten Dienste als Chips.",
    preview: true,
  });
}

console.info(`%c HOMELAB-STATUS-COMPACT %c v${VERSION} `, "color:#fff;background:#4caf50;font-weight:700", "color:#4caf50");
