#!/usr/bin/env bash
# Sauvegarde compressée de la base dans ~/backups, en gardant les 14 derniers jours.
# Lancé chaque nuit par cron (voir README de déploiement) ; manuellement : bash scripts/backup.sh
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

DEST="${BACKUP_DIR:-$HOME/backups}"
mkdir -p "$DEST"
FICHIER="$DEST/monkey-$(date +%F_%H%M).sql.gz"

pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip > "$FICHIER.tmp"
mv "$FICHIER.tmp" "$FICHIER"
find "$DEST" -name 'monkey-*.sql.gz' -mtime +14 -delete

echo "Sauvegarde créée : $FICHIER ($(du -h "$FICHIER" | cut -f1))"
