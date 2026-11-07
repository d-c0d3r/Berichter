# Berichter — Vue migration

Frontend перенесён на Vue 3 + TypeScript + Vite. Backend НЕ входит в архив:
сохраните свой каталог backend, backend/.env и существующий Docker volume.

## 0. Что есть в архиве и что проверено

- Исходники frontend, компоненты, composables, API-слой.
- Dockerfile с Node build stage и Nginx runtime stage.
- Nginx reverse proxy со streaming; ваш Compose с frontend на порту 1800.
- Инструкция локальной разработки и проверки.
- Шесть unit-тестов.

ВАЖНО: npm install в среде подготовки не выполнен — зависимости Vue/Vite
отсутствуют в offline-кеше, доступ к npm registry из среды отсутствует.
Нет package-lock.json и готового dist. npm run build, vue-tsc, Vue template
compiler и Docker build здесь не запускались. Нельзя считать сборку проверенной.
Синтаксис TypeScript/script setup разобран Babel; 6 unit-тестов выполнены
после удаления типов Babel. Это НЕ заменяет проверку типов и Vue-сборку.
Первый npm install создаст lockfile — сохраните его в Git.

## 1. Как разместить файлы

Существующая структура:

    project/
      backend/                 # ваш существующий backend, НЕ удалять
      frontend/                # заменить новой папкой из архива
      docker-compose.yml
      .dockerignore

Сделайте резервную копию старого frontend и Compose.
Перенесите frontend, docker-compose.yml и .dockerignore из архива в корень
своего проекта. Не создавайте вложенную структуру frontend/frontend.
Docker build context остаётся корнем проекта, не каталогом frontend.
Не удаляйте volume и не используйте docker compose down -v.
Если у вас Compose уже менялся после отправки, объедините изменения вручную.

## 2. Установка окружения (Linux/macOS)

Нужны Git, Node.js >=22.12, npm. Docker нужен только для контейнерного запуска.
.nvmrc фиксирует ветку Node 22, используйте актуальное исправление этой ветки.

Если nvm уже установлен:

    cd frontend
    nvm install
    nvm use
    node --version
    npm --version
    npm install

Если nvm не установлен, установите Node через официальный установщик
https://nodejs.org/ либо менеджер вашей ОС. Не используйте устаревший Node
из репозитория ОС без проверки версии. Для nvm используйте официальный
репозиторий https://github.com/nvm-sh/nvm и его инструкцию для вашей shell.
Перезапустите terminal после установки и выполните node --version.

Рекомендуемый редактор: VS Code с расширением Vue - Official.
Установка компонентов сборки через pip/uv не нужна.

## 3. Настройка локального API

    cd frontend
    cp .env.example .env

В .env:

    API_PROXY_TARGET=http://127.0.0.1:8000

Это серверная настройка Vite proxy, не переменная для браузера.
Для backend на другой машине укажите доступный URL, например
http://nova:8000, только если этот адрес доступен с компьютера разработки.
Backend должен быть уже запущен по своей текущей инструкции.

public/config.js содержит:

    window.BERICHTER_CONFIG = Object.freeze({ apiBase: '/api/v1' });

Браузер обращается к /api/v1 на origin frontend. Vite при разработке,
Nginx в Docker проксируют запросы на backend. Это не требует открытия
backend из браузера и не зависит от localhost на телефоне.
Изменив .env, перезапустите Vite. Не кладите секреты в public/config.js
или переменные с префиксом VITE_: они доступны клиенту.

## 4. Локальная разработка

В frontend:

    npm run dev

Откройте http://localhost:5173. С телефона в той же сети:
http://IP-компьютера:5173. Разрешите входящие соединения firewall только
из доверенной сети. Не публикуйте dev server в Интернет.
Код обновляется через Vite HMR.

Если backend запускается через ваш Compose, порт 8000 сейчас не опубликован.
Для разработки используйте override ИЗ КОРНЯ ПРОЕКТА:

    docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build backend

Он публикует backend ТОЛЬКО на 127.0.0.1:8000.
Для управления этим вариантом используйте ту же пару -f файлов.
После этого frontend/npm run dev подключается через API_PROXY_TARGET.

Альтернатива: запустите полный Compose и задайте
API_PROXY_TARGET=http://127.0.0.1:1800 — Vite попадёт в Nginx, затем в backend.

## 5. Проверка и production-сборка

    cd frontend
    npm run typecheck
    npm test
    npm run build
    npm run preview

Preview: http://localhost:4173. Vite preview использует тот же API proxy.
Build включает проверку типов. Готовые файлы появляются в frontend/dist.
После первого npm install сохраните package-lock.json. Последующие чистые
установки делайте через npm ci. Версии в package.json ограничены диапазонами,
поэтому именно lockfile фиксирует полный набор зависимостей.

## 6. Запуск собранного сайта через Python

    cd frontend
    npm run build
    cd dist
    uv run python3 -m http.server 80

Для непривилегированного пользователя можно использовать порт 8080.
НО Python http.server НЕ проксирует /api. Для него нужно изменить dist/config.js
и указать прямой доступный браузеру адрес backend, например
http://192.168.1.20:8000/api/v1, а backend должен разрешать CORS для origin сайта.
На HTTPS frontend нельзя использовать HTTP backend.
Для обычной эксплуатации рекомендуется Nginx/Compose ниже: там адрес API
менять не нужно и всё работает через один origin.
Повторная сборка перезапишет dist/config.js из public/config.js.

## 7. Production в Docker с Nginx

Нужны Docker Engine/Desktop и Compose plugin (команда docker compose).
Проверьте:

    docker --version
    docker compose version

В корне вашего проекта, где уже есть backend:

    docker compose config
    docker compose up -d --build
    docker compose ps
    docker compose logs --tail=100 frontend backend

Открыть http://localhost:1800 или http://IP-сервера:1800.
Compose ждёт healthy backend. Данные остаются в berichter_data:/data.
Dockerfile frontend собирает Vue на Node, затем копирует только dist в Nginx.
Node и исходники не нужны в runtime stage.
Без lockfile используется npm install; при наличии lockfile — npm ci.
Нужен доступ к registry для скачивания Node/Nginx образов и npm-пакетов.

Nginx сохраняет путь /api/v1/...; streaming-буферизация отключена,
read timeout 600 секунд. DNS backend обновляется через Docker resolver.
Приложение использует hash-навигацию, Nginx также имеет SPA fallback.
/healthz проверяет только доступность Nginx, не состояние backend.
Не отключайте проверку типов в Dockerfile при ошибке сборки — сначала
исправьте ошибку, которая указана в логе npm run build.

При изменении исходников:

    docker compose up -d --build frontend

Для воспроизводимой production-сборки после первого install закоммитьте
package-lock.json. В дальнейшем можно закрепить Docker images по digest
по вашей политике обновлений.

## 8. HTTPS и копирование

Nginx внутри контейнера слушает HTTP 80. TLS не настраивается автоматически.
Для внешнего доступа используйте существующий TLS reverse proxy/tunnel
с действительным сертификатом, frontend и /api должны оставаться на одном origin.
Clipboard API по HTTP с другого устройства может быть запрещён. В приложении
есть legacy fallback и окно для ручного копирования; обхода защиты нет.
Не публикуйте приложение бездумно в Интернет: аккаунтов и авторизации в этом
релизе НЕТ, как и в исходном backend. URL не является защитой доступа.

## 9. Сохранённые функции и ограничения

- Загрузка даты, редактирование существующего текста.
- Черновики по дням только в памяти вкладки; пустой черновик тоже сохраняется.
- AI toggle, bypass для Urlaub/Krankmeldung.
- JSON или plain UTF-8 streaming генерация, Stop, проверка фактического сохранения.
- Пропуски по missing_dates (не по count), группировка по месяцам.
- Архив, пагинация, обновление сохранённой недели, открытие дня.
- ZIP по диапазону либо по всем неделям API.
- Копирование с fallback, мобильная нижняя навигация и safe-area.

API POST /reports/ принимает JSON-СТРОКУ, не объект. maxLength=400 сохранён.
Загруженный длинный текст не обрезается, но запись >400 символов backend
не принимает. Для увеличения лимита сначала измените API, затем MAX_NOTES.
Отдельного endpoint обновления нет: используется тот же POST. Возможность
перезаписи существующей даты зависит от вашего backend и требует проверки.
Формат missing_dates и streaming не полностью описан в OpenAPI — сохранены
ожидания прежнего frontend. SSE-обёртки не добавлялись: ожидается plain text.

## 10. Проверка на вашем backend перед заменой рабочей версии

1. npm run typecheck && npm test && npm run build.
2. Загрузить существующий день: его текст в редакторе и справа.
3. Изменить текст, перейти на другой день, вернуться: черновик сохранён.
4. Очистить редактор и переключиться туда-обратно: он остаётся пустым.
5. Сохранить без AI, перезагрузить и проверить БД/текст.
6. Проверить генерацию с AI и Stop: статус не обещает сохранение после отмены.
7. Быстро переключить даты: поздний ответ не подменяет выбранный день.
8. Открыть пропуск и день из архива, проверить пагинацию.
9. ZIP за диапазон и все недели, отмена экспорта.
10. Копирование по HTTP и HTTPS, ручной fallback.
11. Телефон: нижнее меню, поля даты, диалоги; клавиатура: Tab/Enter/Escape.
12. Проверить восстановление backend контейнера без пересборки frontend.

Если что-то падает, приложите первую ошибку npm run build или логи сервиса.
Не отправляйте .env с секретами и реальные пользовательские отчёты.
