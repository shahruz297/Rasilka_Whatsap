#!/bin/bash
# ================================================================
# Deploy Script — Для проекта WhatsApp Рассылки (Node.js)
# ================================================================
# Инструкция:
#   1. Проверьте настройки ниже (IP, DOMAIN уже прописаны).
#   2. Убедитесь, что ваш домен ссылается на сервер (DNS A-запись).
#   3. Сделайте скрипт исполняемым (Git Bash: chmod +x deploy.sh)
#   4. Запустите: ./deploy.sh
# ================================================================
set -e

# ================================================================
# 🔧 НАСТРОЙКИ (ДЛЯ НОВОГО САЙТА ОБЯЗАТЕЛЬНО МЕНЯЙТЕ ЗНАЧЕНИЯ!)
# ================================================================
SERVER_IP="89.46.33.230"
SERVER_USER="root"

# Уникальное имя проекта (без пробелов!). Для другого сайта напишите другое имя (например: my_shop2)
PROJECT_NAME="rasilka_project"

# Домен вашего сайта
DOMAIN="sender.inbrain.kz"

ADMIN_EMAIL="admin@inbrain.kz"  # Замените на вашу почту
LOCAL_PROJECT_PATH="."           # Текущая папка проекта

# Порт приложения. Для каждого нового сайта на этом же сервере порт ДОЛЖЕН БЫТЬ РАЗНЫМ (например: 3000, 3001, 3002...)
BACKEND_PORT="3000"
# ================================================================

SERVER="${SERVER_USER}@${SERVER_IP}"
REMOTE_DIR="/home/${PROJECT_NAME}"
SERVICE_NAME="${PROJECT_NAME}-app"

echo "=== 1/5: Загрузка файлов на сервер ==="
ssh ${SERVER} "mkdir -p ${REMOTE_DIR}"

if command -v rsync &> /dev/null; then
    echo "🚀 Используется rsync для загрузки..."
    rsync -avz --exclude 'node_modules' --exclude '.git' \
        --exclude 'database/*.sqlite' --exclude 'uploads' \
        --exclude '.wwebjs_auth' --exclude '.wwebjs_cache' \
        --exclude '.gemini' --exclude 'brain' --exclude '.tempmediaStorage' \
        -e ssh \
        "${LOCAL_PROJECT_PATH}/" "${SERVER}:${REMOTE_DIR}/"
else
    echo "📦 rsync не найден (вы на Windows). Используем упаковку tar + scp..."
    ARCHIVE_PATH="/tmp/${PROJECT_NAME}_deploy.tar.gz"
    
    # Создаем временный архив локально (ошибки игнорируем, так как файлы могут меняться)
    tar -czf "${ARCHIVE_PATH}" \
        --exclude='node_modules' --exclude='.git' \
        --exclude='database/*.db' --exclude='database/*.sqlite' --exclude='uploads' \
        --exclude='.wwebjs_auth' --exclude='.wwebjs_cache' \
        --exclude='.gemini' --exclude='brain' --exclude='.tempmediaStorage' \
        -C "${LOCAL_PROJECT_PATH}" . || echo "⚠️ Предупреждение tar (игнорируем)"
    
    # Отправляем архив на сервер
    scp "${ARCHIVE_PATH}" ${SERVER}:${REMOTE_DIR}/deploy_archive.tar.gz
    
    # Распаковываем на сервере и удаляем архив (с ключом m чтобы не было ошибок со временем)
    ssh ${SERVER} "cd ${REMOTE_DIR} && tar -xzmf deploy_archive.tar.gz && rm deploy_archive.tar.gz"
    
    # Удаляем локальный архив
    rm -f "${ARCHIVE_PATH}"
fi

echo ""
echo "=== 2/5: Установка Node.js, Nginx и зависимостей ==="
ssh ${SERVER} REMOTE_DIR="${REMOTE_DIR}" bash << 'REMOTE'
set -e

# Установка системных зависимостей, необходимых для Puppeteer (WhatsApp Web)
apt-get update -qq
apt-get install -y -qq curl nginx certbot python3-certbot-nginx \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    > /dev/null 2>&1

# Установка Node.js 20.x, если node или npm не установлены
if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Установка пакетов проекта
cd "${REMOTE_DIR}"
npm install --production

echo "✅ Зависимости успешно установлены"
REMOTE

echo ""
echo "=== 3/5: Создание systemd сервиса для приложения ==="
ssh ${SERVER} PROJECT_NAME="${PROJECT_NAME}" REMOTE_DIR="${REMOTE_DIR}" \
    SERVICE_NAME="${SERVICE_NAME}" BACKEND_PORT="${BACKEND_PORT}" bash << 'REMOTE'
set -e

cat > /etc/systemd/system/${SERVICE_NAME}.service << SERVICE
[Unit]
Description=${PROJECT_NAME} Node.js App
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${REMOTE_DIR}
Environment=PORT=${BACKEND_PORT}
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl restart ${SERVICE_NAME}
sleep 2
systemctl status ${SERVICE_NAME} --no-pager || true
echo "✅ Сервис приложения запущен"
REMOTE

echo ""
echo "=== 4/5: Настройка Nginx (Reverse Proxy + WebSockets) ==="
ssh ${SERVER} PROJECT_NAME="${PROJECT_NAME}" REMOTE_DIR="${REMOTE_DIR}" \
    DOMAIN="${DOMAIN}" BACKEND_PORT="${BACKEND_PORT}" bash << 'REMOTE'
set -e

cat > /etc/nginx/sites-available/${PROJECT_NAME} << NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/${PROJECT_NAME} /etc/nginx/sites-enabled/${PROJECT_NAME}

nginx -t
systemctl restart nginx
echo "✅ Nginx настроен"
REMOTE

echo ""
echo "=== 5/5: Установка SSL сертификата (Let's Encrypt) ==="
ssh ${SERVER} DOMAIN="${DOMAIN}" ADMIN_EMAIL="${ADMIN_EMAIL}" bash << 'REMOTE'
certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m ${ADMIN_EMAIL} \
    || echo "⚠️ SSL пропущен (проверьте правильность DNS-записей домена)"
systemctl restart nginx
REMOTE

echo ""
echo "================================================================"
echo "  ✅ Деплой успешно завершён!"
echo "  🌐 Сайт доступен по адресу: https://${DOMAIN}"
echo "================================================================"
