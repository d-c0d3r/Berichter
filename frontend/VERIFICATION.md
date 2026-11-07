# Проверки в среде подготовки

Выполнено:
- Babel: синтаксический разбор всех .ts и script setup блоков (19 файлов/блоков).
- Babel: удаление TypeScript-типов из lib и tests для запуска в доступном Node 20.
- node --test: 6 тестов прошли, 0 ошибок.
  * calendar dates and year boundaries
  * report validation
  * week validation sorts and rejects wrong week
  * safe ZIP filename
  * generation JSON formats and UTF-8 stream
  * day fetch handles 404 and rejects another date
- Проверка локальных импортов, JSON/YAML-конфигурации и CSS-парсинг.
- Проверка ZIP на целостность.

Не выполнено:
- npm install: ENOTCACHED в offline-среде, registry недоступен.
- vue-tsc / npm run build / компиляция Vue template / E2E в браузере.
- Docker build, nginx -t, взаимодействие с реальным backend.

Нет dist и package-lock.json. Первый install/build выполняется на вашей машине.
Это рабочая миграция исходников, но не подтверждённая production-сборка.
