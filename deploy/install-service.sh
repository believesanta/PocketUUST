#!/usr/bin/env bash
set -euo pipefail

if (( EUID == 0 )); then
  echo 'Запускайте скрипт от обычного пользователя; sudo будет вызван только для systemd.' >&2
  exit 1
fi
project_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
node_path=$(command -v node || true)
if [[ -z "$node_path" || ! -x "$node_path" ]]; then
  echo 'Сначала установите Node.js 24 и проверьте: command -v node' >&2
  exit 1
fi
if [[ "$project_dir" =~ [[:space:]] || "$node_path" =~ [[:space:]] ]]; then
  echo 'Переместите проект и Node.js в пути без пробелов для systemd.' >&2
  exit 1
fi
cd "$project_dir"
CAMPUS_REGISTRATION_ENABLED=false CAMPUS_EMAIL_DOMAINS=stud.uust.ru NODE_ENV=production HOST=127.0.0.1 PORT=3000 "$node_path" --env-file-if-exists=.env scripts/check-production.mjs

# The service reads .env itself. Values below override dev settings in that file.
cat <<UNIT | sudo tee /etc/systemd/system/pocketuust.service >/dev/null
[Unit]
Description=PocketUUST website
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$(id -un)
WorkingDirectory=$project_dir
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=CAMPUS_REGISTRATION_ENABLED=false
Environment=CAMPUS_EMAIL_DOMAINS=stud.uust.ru
ExecStart=$node_path --env-file-if-exists=.env scripts/serve.mjs
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now pocketuust.service
sudo systemctl --no-pager status pocketuust.service
