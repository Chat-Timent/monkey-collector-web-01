#!/usr/bin/env bash
# Met le site à jour depuis GitHub : sauvegarde, récupération du code, dépendances, redémarrage.
# Usage sur le Raspberry : bash scripts/deploy.sh
# Le schéma de la base n'est jamais touché ici : une évolution du schéma se fait à la main,
# par une migration additive (ALTER TABLE ... ADD COLUMN), avant ou pendant le déploiement.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "1/4 Sauvegarde de la base"
bash scripts/backup.sh

echo "2/4 Récupération du code"
git pull --ff-only

echo "3/4 Dépendances"
npm ci --omit=dev

echo "4/4 Redémarrage"
pm2 restart monkey-collector --update-env
pm2 save > /dev/null

echo "Déploiement terminé : $(git log -1 --oneline)"
