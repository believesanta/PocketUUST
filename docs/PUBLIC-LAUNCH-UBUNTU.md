# Публичный запуск PocketUUST на личном ПК (Ubuntu 24.04)

Эта инструкция рассчитана на запуск для первых посетителей **с заранее выданными тестовыми аккаунтами, без собственного домена**. Сайт работает на вашем ПК под Node.js 24 и доступен по HTTPS-адресу `*.ts.net` через Tailscale Funnel. Пробрасывать порты в роутере не нужно. Посетителям Tailscale не требуется. Funnel сейчас находится в beta и имеет ограничения по пропускной способности; для долгосрочного сайта с большой аудиторией понадобится отдельный домен и другое размещение.

Схема: браузер посетителя → HTTPS Funnel → `127.0.0.1:3000` на вашем ПК → PocketUUST → ваши SQLite-файлы в `.runtime`.

## 1. Подготовка проекта

Откройте терминал в **своей** папке PocketUUST (`package.json` должен быть виден). Убедитесь, что скачана новая версия проекта. Если заменяете старые файлы, сохраните каталоги `.runtime` и текущий `.env`: в них аккаунты и настройки. В архиве для публичного запуска нет готовых паролей тестовых аккаунтов, `.env` и базы. Файлы с тестовыми паролями не загружайте на публичный хостинг или в Git.

Если работающий сайт был запущен через `npm run dev`, остановите его `Ctrl+C`. Для резервной копии остановленного сайта выполните:

```bash
cp -a .runtime "$HOME/PocketUUST-runtime-backup-$(date +%Y%m%d-%H%M%S)"
```

Если каталога `.runtime` ещё нет, этот шаг пропустите. Не удаляйте `.runtime` при обновлении.

```bash
node --version
python3 --version
npm ci
npm run build
```

Нужны Node.js **24.x** и Python **3.12+**. `npm run dev` нужен для разработки; для публики ниже запускается production-сервер.

## 2. Установка Tailscale для всех пользователей Ubuntu

Используйте официальный пакетный репозиторий Tailscale для Ubuntu 24.04. Если Tailscale уже установлен, начните с `sudo tailscale up`.

```bash
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.noarmor.gpg | sudo tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.tailscale-keyring.list | sudo tee /etc/apt/sources.list.d/tailscale.list
sudo apt-get update
sudo apt-get install tailscale
sudo tailscale up
```

Последняя команда покажет ссылку входа: откройте её в браузере и подтвердите свой аккаунт Tailscale. Если Funnel ещё не разрешён для вашей сети, команда следующего шага предложит включить его через страницу администрирования. Для этого нужны права владельца или администратора вашей сети Tailscale.

[Официальная инструкция для Ubuntu](https://pkgs.tailscale.com/stable/) · [Возможности Funnel](https://tailscale.com/docs/features/tailscale-funnel).

## 3. Получение постоянного HTTPS-адреса

```bash
sudo tailscale funnel --bg 3000
sudo tailscale funnel status
```

Скопируйте адрес вида `https://имя-пк.имя-сети.ts.net` из вывода. Команда `--bg` сохраняет настройку Funnel после перезагрузки. Пока приложение ещё не запущено, адрес может отвечать ошибкой — это нормально. DNS иногда начинает работать спустя несколько минут.

## 4. Настройки сайта

Откройте `.env` в папке проекта (`nano .env`). Если файла нет, создайте его из `.env.example` через `cp .env.example .env`. Добавьте или измените следующие строки, указав **свой точный адрес** из предыдущего шага:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
CAMPUS_PUBLIC_ORIGIN=https://имя-пк.имя-сети.ts.net
```

Не добавляйте завершающий `/`, пути `/forum` или порт к `CAMPUS_PUBLIC_ORIGIN`. Для закрытой регистрации используйте `CAMPUS_REGISTRATION_ENABLED=false` и `CAMPUS_EMAIL_DOMAINS=stud.uust.ru`. Скрипт установки службы установит эти два значения сам, даже если в вашем прежнем `.env` остался `CAMPUS_EMAIL_DOMAINS=*`. Новые аккаунты никто создать не сможет, а 128 ранее подтверждённых тестовых аккаунтов войдут без письма. SMTP пока не нужен. При `NODE_ENV=production` фиксированный код `123456` не действует. Помощник с Ollama требует запущенной Ollama и скачанной модели; если пока не нужна генерация, установите `ASSISTANT_PROVIDER=off` — поиск по материалам продолжит работать.

Ограничьте чтение конфигурации и пользовательских данных другими аккаунтами ПК:

```bash
chmod 600 .env
chmod -R go-rwx .runtime
```

Если `.runtime` ещё не создана, выполните вторую команду после первого запуска сайта. Расписание требует доступа к источнику УУНиТ: уберите `SCHEDULE_OFFLINE=1`, если указывали раньше.

## 5. Проверка перед запуском

```bash
CAMPUS_REGISTRATION_ENABLED=false CAMPUS_EMAIL_DOMAINS=stud.uust.ru NODE_ENV=production HOST=127.0.0.1 npm run check:production
```

Проверка не выводит пароли и не отправляет письма. Она проверит настройки, сборку, Python и наличие 128 подтверждённых аккаунтов в сохранённой `.runtime/campus/campus.sqlite`. SMTP в режиме готовых аккаунтов не проверяется. Если аккаунтов нет, перенесите прежнюю `.runtime` со своего ПК либо положите свой приватный `test-accounts.txt` в папку проекта и **один раз** выполните `npm run seed:test-accounts` при остановленном сайте. После этого уберите файл паролей из публичной папки проекта и повторите проверку. Импорт не перезапишет уже имеющиеся аккаунты.

## 6. Запуск после перезагрузки ПК

Находясь в папке PocketUUST, выполните:

```bash
bash deploy/install-service.sh
```

Скрипт ещё раз выполнит проверку и создаст системную службу `pocketuust.service` от имени вашего обычного пользователя. Она поднимет сайт на `127.0.0.1:3000` без Vite и автоматически перезапустит Node после сбоя или перезагрузки Ubuntu. Установка через `sudo` используется только для системной службы.

Проверьте локально:

```bash
curl -i http://127.0.0.1:3000/api/campus/auth/config
sudo systemctl --no-pager status pocketuust
sudo tailscale funnel status
```

В JSON поле `testEmailCode` должно быть `null`, `registrationEnabled` — `false`, `emailDomains` — `["stud.uust.ru"]`. Теперь откройте публичный HTTPS-адрес **с другого устройства** по мобильной сети. Проверьте главную страницу, расписание, вход по одному из выданных тестовых аккаунтов и форум. Отдельную новую регистрацию сайт не предлагает.

Если локально сайт открывается, а с телефона нет, проверьте `sudo tailscale funnel status`; на первом запуске DNS может задержаться до 10 минут. Если вход не работает, проверьте наличие прежней `.runtime/campus/campus.sqlite` и выбранный логин с паролем.

## Управление

```bash
sudo journalctl -u pocketuust -n 80 --no-pager
sudo systemctl restart pocketuust
sudo systemctl stop pocketuust
sudo systemctl start pocketuust
sudo tailscale funnel status
```

Отключить внешний доступ: `sudo tailscale funnel --https=443 off`. Node-служба после этого может продолжать работать локально. Включить снова: `sudo tailscale funnel --bg 3000`.

Если меняете код, сначала остановите службу, сохраните копию `.runtime`, замените файлы проекта без `.runtime` и `.env`, затем `npm ci`, `npm run build`, `CAMPUS_REGISTRATION_ENABLED=false CAMPUS_EMAIL_DOMAINS=stud.uust.ru NODE_ENV=production HOST=127.0.0.1 npm run check:production`, `sudo systemctl restart pocketuust`. Файл службы менять не нужно, пока папка проекта и путь к Node.js не изменились.

Для постоянного сайта следите, чтобы компьютер не уходил в сон и интернет работал. Копируйте `.runtime` при остановленной службе или делайте согласованную SQLite-копию; эта папка содержит аккаунты и форум. При проблемах пришлите вывод `sudo systemctl --no-pager status pocketuust` и `sudo journalctl -u pocketuust -n 80 --no-pager` без содержимого `.env`.
