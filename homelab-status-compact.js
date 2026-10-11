/*
 * Homelab Status Compact v2
 * Platzsparende Statusübersicht: ein Banner fasst alle ausgewählten Container/VMs
 * samt Domain-Erreichbarkeit zusammen, darunter optional die wichtigsten Dienste
 * als Chips. Die Daten kommen aus den Dienst-Entitäten der Integration
 * „Proxmox Homelab Monitor“ (binary_sensor.<gast>_service).
 */
// Eigener Gültigkeitsbereich: kollidiert nicht mit anderen Karten, auch wenn
// die Datei als klassisches Skript statt als Modul geladen wird.
(() => {
  const VERSION = "2.0.0";

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
      err_timeout: "Zeitüberschreitung",
      err_ssl: "Zertifikatsfehler",
      err_dns: "DNS-Fehler",
      err_connection: "keine Verbindung",
      general: "Allgemein",
      title: "Name der Karte (optional, z. B. feprox)",
      expand_problems: "Probleme automatisch aufklappen",
      services: "Überwachte Dienste",
      services_hint:
        "Alle angehakten Dienste fließen in den Banner ein. Mit „Als Chip anzeigen“ erscheinen die wichtigsten zusätzlich einzeln darunter. Domains trägst du in der Integration ein: Proxmox Homelab Monitor → Konfigurieren → Domains der Dienste.",
      name: "Anzeigename",
      icon: "Icon",
      pinned: "Als Chip anzeigen",
      domain_none: "keine Domain",
      no_entities: "Keine Dienste gefunden. Ist die Integration „Proxmox Homelab Monitor“ eingerichtet?",
      search: "Dienste durchsuchen …",
      search_count: "{shown} von {total}",
      search_none: "Keine Treffer für diese Suche.",
      selected_count: "{sel} überwacht · {pin} als Chip",
      nodes: "Nodes:",
      node_other: "Andere",
      up: "Nach oben",
      down: "Nach unten",
      missing: "Integration „Proxmox Homelab Monitor“ nicht gefunden. Ohne sie zeigt die Karte nur den Container-Status.",
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
      err_timeout: "timeout",
      err_ssl: "certificate error",
      err_dns: "DNS error",
      err_connection: "no connection",
      general: "General",
      title: "Card name (optional, e.g. feprox)",
      expand_problems: "Expand problems automatically",
      services: "Monitored services",
      services_hint:
        "All checked services feed into the banner. Use “Show as chip” to also show the most important ones below it. Domains are set in the integration: Proxmox Homelab Monitor → Configure → Service domains.",
      name: "Display name",
      icon: "Icon",
      pinned: "Show as chip",
      domain_none: "no domain",
      no_entities: "No services found. Is the “Proxmox Homelab Monitor” integration set up?",
      search: "Search services …",
      search_count: "{shown} of {total}",
      search_none: "No services match this search.",
      selected_count: "{sel} monitored · {pin} as chip",
      nodes: "Nodes:",
      node_other: "Other",
      up: "Move up",
      down: "Move down",
      missing: "“Proxmox Homelab Monitor” integration not found. Without it the card only shows the container state.",
    },
  };

  const t = (hass, key) => {
    const lang = String(hass?.language || "en").split("-")[0];
    return (I18N[lang] || I18N.en)[key] ?? I18N.en[key] ?? key;
  };

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const COLORS = {
    ok: "76, 175, 80",
    down: "244, 67, 54",
    warn: "255, 152, 0",
    unknown: "158, 158, 158",
  };

  // ---------------------------------------------------------------------------
  // Dienst-Entitäten der Integration lesen
  // ---------------------------------------------------------------------------
  const isServiceState = (st) => !!st && st.attributes && "problem" in st.attributes && "guest_status" in st.attributes;

  // v1-Konfigurationen nennen den Status-Sensor (…_status); dazu gehört …_service.
  function serviceEntityId(hass, id) {
    if (isServiceState(hass.states[id])) return id;
    if (/_status$/.test(id)) {
      const candidate = id.replace(/_status$/, "_service");
      if (isServiceState(hass.states[candidate])) return candidate;
    }
    return id;
  }

  // Zustand eines Dienstes: Container (main), Domain (dom) und Schwere (sev)
  function serviceState(hass, svc) {
    const id = serviceEntityId(hass, svc.entity);
    const st = hass.states[id];
    const a = st?.attributes || {};
    const x = { id, url: "", dom: null, code: null, err: null, problem: null, node: a.node || "" };
    x.name = svc.name || a.service_name || a.friendly_name || svc.entity;
    if (!st || ["unavailable", "unknown"].includes(st.state)) {
      x.main = "unknown";
      x.problem = "unavailable";
    } else if (isServiceState(st)) {
      x.main = a.guest_status === "running" ? "ok" : a.guest_status ? "down" : "unknown";
      x.url = a.url || "";
      if (x.url) x.dom = a.domain_ok === true ? "ok" : a.domain_ok === false ? "down" : "unknown";
      x.code = a.http_status ?? null;
      x.err = a.error ?? null;
      x.problem = a.problem ?? null;
    } else {
      x.main = st.state === "on" ? "ok" : "down";
      x.problem = x.main === "down" ? "offline" : null;
    }
    // Container weg = rot, nur Domain weg = orange
    x.sev = !x.problem ? "ok" : x.problem === "domain" ? "warn" : "down";
    return x;
  }

  function reasonText(hass, x) {
    if (x.problem === "unavailable") return t(hass, "unavailable");
    if (x.problem === "offline") return t(hass, "offline");
    if (x.problem === "domain") {
      const detail = x.code ? `HTTP ${x.code}` : x.err ? t(hass, `err_${x.err}`) : "";
      return t(hass, "domain_down") + (detail ? ` (${detail})` : "");
    }
    return t(hass, "running");
  }

  // Kurzform für die Banner-Zeile: "Jellyfin offline", "Immich Domain 502"
  function shortReason(hass, x) {
    if (x.problem === "domain") {
      const detail = x.code ? ` ${x.code}` : x.err ? ` (${t(hass, `err_${x.err}`)})` : "";
      return `${x.name} ${t(hass, "domain_short")}${detail}`;
    }
    return `${x.name} ${reasonText(hass, x).toLowerCase()}`;
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
    .chip {
      display: inline-flex; align-items: center; gap: 6px; max-width: 100%;
      padding: 4px 10px 4px 8px; border-radius: 14px; cursor: pointer; box-sizing: border-box;
      font-size: 12px; line-height: 16px; color: var(--primary-text-color);
      background: var(--secondary-background-color, rgba(127,127,127,0.12));
      border: 1px solid transparent;
    }
    .chip.bad { background: rgba(var(--c), 0.14); border-color: rgba(var(--c), 0.5); }
    .chip .cname { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .chip ha-icon.cicon { --mdc-icon-size: 14px; color: rgb(var(--ic)); display: flex; flex: none; }
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
        .filter((id) => isServiceState(hass.states[id]))
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
      this._config = { ...config };
      this._render();
    }

    set hass(hass) {
      const old = this._hass;
      this._hass = hass;
      if (!this._config) return;
      if (!old || this._config.services.some((s) => {
        const id = serviceEntityId(hass, s.entity);
        return old.states[id] !== hass.states[id];
      })) {
        this._render();
      }
    }

    getCardSize() {
      const pinned = this._config?.services.filter((s) => s.pinned).length || 0;
      return 1 + Math.ceil(pinned / 4) + (this._isOpen() ? this._problems().length : 0);
    }

    getGridOptions() {
      return { columns: 12, min_columns: 6 };
    }

    _problems() {
      if (!this._hass || !this._config) return [];
      return this._config.services
        .map((s) => ({ s, ...serviceState(this._hass, s) }))
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
      const summary = problems.map((p) => shortReason(hass, p)).join(" · ");
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
      const hass = this._hass;
      return `<div class="plist">
          ${problems
            .map(
              (p) => `<div class="prow" data-entity="${esc(p.id)}" style="--c: ${COLORS[p.sev]}">
                <span class="dot"></span>
                <span class="pname">${esc(p.name)}</span>
                <span class="preason">${esc(reasonText(hass, p))}</span>
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
      const x = serviceState(hass, s);
      let tip = `${x.name} – ${reasonText(hass, x)}`;
      let web = "";
      if (x.url) {
        const label = x.dom === "ok" ? t(hass, "domain_ok") : x.dom === "down" ? t(hass, "domain_down") : t(hass, "domain_unknown");
        tip += `\n${x.url} – ${label}${x.code ? ` (HTTP ${x.code})` : ""}`;
        web = `<span class="web" data-url="${esc(x.url)}" title="${esc(x.url)}" style="--b: ${COLORS[x.dom || "unknown"]}"><ha-icon icon="mdi:web"></ha-icon></span>`;
      }
      return `<div class="chip${x.sev === "ok" ? "" : " bad"}" data-entity="${esc(x.id)}" title="${esc(tip)}" style="--c: ${COLORS[x.sev]}; --ic: ${COLORS[x.main]}">
          <ha-icon class="cicon" icon="${esc(s.icon || "mdi:circle")}"></ha-icon>
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
    .eid { font-size: 11px; color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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

  class HomelabStatusCompactEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
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
      this._migrated = false;
      this._render();
    }

    set hass(hass) {
      const first = !this._hass;
      this._hass = hass;
      if (first) this._render();
    }

    // v1 -> v2: Status-Sensor durch Dienst-Entität ersetzen, Domain-Felder und
    // Prüf-Optionen entfallen (das macht jetzt die Integration).
    _migrate() {
      if (this._migrated || !this._hass) return;
      this._migrated = true;
      const c = this._config;
      for (const s of c.services) {
        s.entity = serviceEntityId(this._hass, s.entity);
        delete s.domain_check;
        delete s.domain;
      }
      delete c.interval;
      delete c.base_domain;
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
        this._setTop(field, el.value);
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

    _nodeOf(id) {
      return String(this._hass.states[id]?.attributes?.node || "");
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
      const label = (id) => String(hass.states[id]?.attributes?.service_name || id);
      const others = Object.keys(hass.states)
        .filter((id) => isServiceState(hass.states[id]) && !selected.includes(id))
        .sort((a, b) => label(a).localeCompare(label(b)));
      return [...selected, ...others];
    }

    _render() {
      if (!this._config || !this._hass) return;
      this._migrate();
      const hass = this._hass;
      const c = this._config;
      const n = c.services.length;
      const hasIntegration = Object.keys(hass.states).some((id) => isServiceState(hass.states[id]));

      const rows = this._candidates()
        .map((id) => {
          const s = this._svc(id);
          const idx = c.services.indexOf(s);
          const a = hass.states[id]?.attributes || {};
          const label = a.service_name || a.friendly_name || id;
          const domain = a.url ? String(a.url).replace(/^https?:\/\//, "") : t(hass, "domain_none");
          const body = s
            ? `<div class="svc-body">
                <div class="row2">
                  <label class="field">${t(hass, "name")}
                    <input type="text" data-entity="${esc(id)}" data-field="name" value="${esc(s.name || "")}" placeholder="${esc(label)}">
                  </label>
                  <label class="field">${t(hass, "icon")}
                    <input type="text" data-entity="${esc(id)}" data-field="icon" value="${esc(s.icon || "")}" placeholder="mdi:circle">
                  </label>
                </div>
                <label class="check">
                  <input type="checkbox" data-act="pinned" data-entity="${esc(id)}" ${s.pinned ? "checked" : ""}>
                  ${t(hass, "pinned")}
                </label>
              </div>`
            : "";
          const node = this._nodeOf(id);
          const hay = [label, id, s?.name, a.url, node].filter(Boolean).join(" ").toLowerCase();
          const hidden = (this._query.trim() && !this._matches(hay)) || this._hiddenNodes.has(node) ? " hidden" : "";
          return `<div class="svc${s ? " on" : ""}${hidden}" data-search="${esc(hay)}" data-node="${esc(node)}">
              <div class="svc-head">
                <label class="check">
                  <input type="checkbox" data-act="toggle" data-entity="${esc(id)}" ${s ? "checked" : ""}>
                  <span style="min-width:0">
                    <div>${esc(s?.name || label)}</div>
                    <div class="eid">${esc(domain)}${node ? ` · ${esc(node)}` : ""}</div>
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

      const pinnedCount = c.services.filter((s) => s.pinned).length;

      this.shadowRoot.innerHTML = `
        <style>${EDITOR_STYLE}</style>
        ${hasIntegration ? "" : `<div class="note">${t(hass, "missing")}</div>`}
        <h3>${t(hass, "general")}</h3>
        <label class="field">${t(hass, "title")}
          <input type="text" data-field="title" value="${esc(c.title || "")}" placeholder="feprox">
        </label>
        <label class="check">
          <input type="checkbox" data-act="top_flag" data-key="expand_problems" ${c.expand_problems ? "checked" : ""}>
          ${t(hass, "expand_problems")}
        </label>

        <h3>${t(hass, "services")}</h3>
        <div class="hint">${t(hass, "services_hint")}<br>${esc(
          t(hass, "selected_count").replace("{sel}", n).replace("{pin}", pinnedCount)
        )}</div>
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
      description: "Banner mit allen Containern/VMs und Domains, darunter die wichtigsten Dienste als Chips (benötigt die Integration Proxmox Homelab Monitor).",
      preview: true,
    });
  }

  console.info(`%c HOMELAB-STATUS-COMPACT %c v${VERSION} `, "color:#fff;background:#4caf50;font-weight:700", "color:#4caf50");
})();
