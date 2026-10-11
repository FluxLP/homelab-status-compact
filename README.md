# Homelab Status Compact

Eine platzsparende Lovelace-Karte für Home Assistant. Statt einer Kachel pro Container zeigt sie **einen Banner**, der alle überwachten Container/VMs (z. B. aus der Proxmox-VE-Integration) und deren Domains zusammenfasst. Darunter erscheinen nur die Dienste, die du als wichtig markierst, als kleine Chips.

Ideal für Wand-Tablets, auf denen nicht gescrollt werden soll.

- **Banner:** optional mit frei wählbarem Namen (z. B. „feprox“), dann grün „Alles in Betrieb · 24/24“ oder rot/orange „3 Probleme: Jellyfin offline · Immich Domain 502 …“
  - Rot: ein Container/VM ist offline oder nicht verfügbar
  - Orange: der Container läuft, aber die Domain ist nicht erreichbar
  - Ein Tipp auf den Banner klappt die Problemliste mit den genauen Gründen auf und wieder zu
- **Chips:** die wichtigsten Dienste einzeln. Der Punkt zeigt den Container, die Weltkugel die Domain. Betroffene Chips werden eingefärbt.
  - Tipp auf einen Chip: More-Info-Dialog der Entität
  - Tipp auf die Weltkugel: öffnet die Domain
- **Visueller Editor:** Dienste per Haken überwachen, mit „Als Chip anzeigen“ zusätzlich einzeln darstellen, Domain-Prüfung pro Dienst, Suche und Node-Filter für lange Listen

Die große Schwester mit einer Kachel pro Dienst ist die [Homelab Status Card](https://github.com/FluxLP/homelab-status-card). Beide Karten teilen sich die Domain-Prüfung: Stehen sie auf demselben Dashboard, wird jede Domain trotzdem nur einmal geprüft.

## Installation

### HACS (benutzerdefiniertes Repository)
1. HACS → ⋮ → *Benutzerdefinierte Repositories*
2. URL dieses Repositorys eintragen, Typ **Dashboard**
3. „Homelab Status Compact“ installieren und den Browser bzw. die App neu laden

### Manuell
1. `homelab-status-compact.js` nach `/config/www/` kopieren
2. *Einstellungen → Dashboards → ⋮ → Ressourcen* → `/local/homelab-status-compact.js` als **JavaScript-Modul** hinzufügen

## Serverseitige Domain-Prüfung (empfohlen)

Derselbe Eintrag wie bei der Homelab Status Card. Ist er dort schon eingerichtet, ist nichts weiter zu tun.

```yaml
shell_command:
  homelab_status_check: >-
    sh -c 'curl -s -o /dev/null -w "%{http_code}" --max-time 10 --url "$0" || true' {{ url }}
```

| Ergebnis | Anzeige |
|---|---|
| HTTP 1xx–4xx | erreichbar (auch 401/403, z. B. bei Login-Seiten) |
| HTTP 5xx (z. B. 502 vom Reverse Proxy) | nicht erreichbar |
| Timeout, DNS- oder Zertifikatsfehler | nicht erreichbar |

**Ohne diesen Eintrag** prüft der Browser des Betrachters die Domain. Das sieht nur „erreichbar ja/nein“, ein 502 vom Reverse Proxy gilt dann als erreichbar.

> Geprüft wird aus deinem Netz und nur, solange das Dashboard geöffnet ist.

## Konfiguration

```yaml
type: custom:homelab-status-compact
title: feprox
interval: 60
base_domain: example.org
expand_problems: false
services:
  - entity: binary_sensor.lxc_jellyfin_100_status
    name: Jellyfin
    pinned: true
    domain_check: true
    domain: jellyfin.example.org
  - entity: binary_sensor.lxc_pihole_105_status
    name: Pi-hole
    pinned: true
  - entity: binary_sensor.lxc_grocy_104_status   # nur im Banner überwacht
```

| Option | Standard | Beschreibung |
|---|---|---|
| `services` | – | Liste der überwachten Dienste (Pflicht) |
| `title` | – | Name der Karte, steht links im Banner (z. B. `feprox`). Praktisch bei mehreren Karten, etwa einer pro Proxmox-Node |
| `interval` | `60` | Prüfintervall der Domains in Sekunden (min. 15) |
| `base_domain` | – | Nur für den Editor: Domain-Vorschlag `<dienst>.<base_domain>` |
| `expand_problems` | `false` | Problemliste automatisch aufklappen, sobald etwas nicht stimmt |

Pro Dienst:

| Option | Beschreibung |
|---|---|
| `entity` | Binärsensor des Containers/der VM, z. B. `binary_sensor.lxc_jellyfin_100_status` (Pflicht) |
| `name` | Anzeigename |
| `icon` | Icon im Chip (Standard `mdi:circle`) |
| `pinned` | `true` zeigt den Dienst zusätzlich als Chip unter dem Banner |
| `domain_check` | `true` prüft zusätzlich die Domain |
| `domain` | Domain oder URL, z. B. `jellyfin.example.org` |

## Lizenz

MIT
