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
- **Visueller Editor:** Dienste per Haken überwachen, mit „Als Chip anzeigen“ zusätzlich einzeln darstellen, Suche und Node-Filter für lange Listen

Die große Schwester mit einer Kachel pro Dienst ist die [Homelab Status Card](https://github.com/FluxLP/homelab-status-card). Beide Karten lesen dieselben Dienst-Entitäten der Integration.

## Installation

1. Integration [Proxmox Homelab Monitor](https://github.com/FluxLP/proxmox-homelab-monitor) einrichten und unter *Konfigurieren → Domains der Dienste* die Domains eintragen
2. HACS → ⋮ → *Benutzerdefinierte Repositories* → URL dieses Repositorys, Typ **Dashboard** → „Homelab Status Compact“ installieren
3. Browser bzw. App neu laden

**Ab v2 kommen die Daten aus der Integration.** Sie prüft die Domains serverseitig rund um die Uhr; die Karte prüft selbst nichts mehr, der `shell_command` aus v1 wird nicht mehr gebraucht.

## Konfiguration

```yaml
type: custom:homelab-status-compact
title: feprox
expand_problems: false
services:
  - entity: binary_sensor.lxc_jellyfin_100_service
    name: Jellyfin
    pinned: true
  - entity: binary_sensor.lxc_pihole_105_service
    name: Pi-hole
    pinned: true
  - entity: binary_sensor.lxc_grocy_104_service   # nur im Banner überwacht
```

| Option | Standard | Beschreibung |
|---|---|---|
| `services` | – | Liste der überwachten Dienste (Pflicht) |
| `title` | – | Name der Karte, steht links im Banner (z. B. `feprox`) |
| `expand_problems` | `false` | Problemliste automatisch aufklappen, sobald etwas nicht stimmt |

Pro Dienst: `entity` (Pflicht, Dienst-Entität der Integration), `name`, `icon`, `pinned` (`true` = zusätzlich als Chip).

## Umstieg von v1

v1-Konfigurationen laufen weiter: `…_status`-Entitäten werden automatisch auf `…_service` umgestellt. `domain_check`, `domain`, `interval` und `base_domain` werden ignoriert und beim nächsten Speichern im Editor entfernt. Den `shell_command: homelab_status_check` in der `configuration.yaml` kannst du löschen.

## Lizenz

MIT
