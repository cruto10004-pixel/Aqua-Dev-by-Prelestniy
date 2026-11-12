# Aqua — веб-мессенджер

Этап 1: архитектура, бэкенд (FastAPI + WebSocket + SQLite), авторизация.

## Структура проекта

```
aqua/
├── backend/
│   ├── app/
│   │   ├── main.py        # приложение, middleware, подключение роутеров и статики
│   │   ├── config.py      # настройки (env), пути, лимиты, белый список MIME
│   │   ├── database.py    # SQLite: соединение и схема
│   │   ├── security.py    # bcrypt, JWT, ограничитель попыток входа
│   │   ├── validators.py  # проверка логина и пароля
│   │   ├── deps.py        # зависимости FastAPI (БД, текущий пользователь)
│   │   ├── services.py    # бизнес-логика чатов/сообщений/доступа к медиа
│   │   ├── realtime.py    # менеджер WebSocket-подключений
│   │   └── routers/       # auth.py, chats.py, media.py, ws.py
│   ├── tests/test_stage1.py
│   └── requirements.txt
├── frontend/assets/       # icon.png, start.webm (понадобятся на Этапах 2–5)
└── data/                  # создаётся при запуске: aqua.db, uploads/, secret.key
```

Слои: **routers** (HTTP/WS, разбор запросов) → **services** (правила) → **database** (SQL).
`realtime` ничего не знает о БД, `validators` — о фреймворке.

## Запуск

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload          # http://127.0.0.1:8000/docs — Swagger
pytest -q                              # тесты
```

Переменные окружения: `AQUA_SECRET_KEY`, `AQUA_DATA_DIR`, `AQUA_DB_PATH`,
`AQUA_JWT_TTL_HOURS`, `AQUA_MAX_UPLOAD_MB`, `AQUA_CORS_ORIGINS`.

## База данных

| Таблица | Поля | Назначение |
|---|---|---|
| `users` | id, username (UNIQUE, без учёта регистра), password_hash, created_at, last_seen | Пользователи |
| `chats` | id, type (`direct`/`group`), title, direct_key (UNIQUE), created_by, created_at | Чаты; `direct_key` = `minId:maxId` исключает дубли личных чатов |
| `chat_members` | chat_id, user_id, role, joined_at — PK (chat_id, user_id) | Участники |
| `messages` | id, chat_id, sender_id, kind, text, media_id, created_at; индекс (chat_id, id DESC) | Сообщения, пагинация по id |
| `media` | id, owner_id, original_name, stored_name, mime, size, kind, created_at | Файлы (на диске под случайным именем) |
| `reactions` | PK (message_id, user_id, emoji) | Для Этапа 5 |

## REST API

| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/auth/register` | `{username, password}` → `{token, user}`; 422 со списками `username_errors` / `password_errors`; 409 если логин занят |
| POST | `/api/auth/login` | `{username, password}` → `{token, user}`; 401 / 429 |
| GET | `/api/auth/me` | Текущий пользователь |
| GET | `/api/users/search?q=` | Поиск по username |
| GET | `/api/chats` | Мои чаты (с последним сообщением) |
| POST | `/api/chats` | `{type:"direct", username}` или `{type:"group", title, members:[...]}` |
| GET | `/api/chats/{id}/messages?before_id=&limit=` | История, постранично |
| POST | `/api/chats/{id}/messages` | Отправка через REST (запасной путь) |
| POST | `/api/media` | multipart, поле `file`; до 50 МБ, MIME из белого списка |
| GET | `/api/media` | Последние загрузки (для файлового менеджера) |
| GET | `/api/media/{id}` | Файл; только владельцу и участникам чата; поддерживает Range |

Заголовок авторизации: `Authorization: Bearer <jwt>` (для `<img>/<video>/<audio>` у `/api/media/{id}` допустим `?token=`).

## WebSocket `/ws`

Первое сообщение клиента — `{"type":"auth","token":"..."}` (10 секунд, иначе закрытие с кодом 4401).
Дальше клиент шлёт `message`, `typing`, `ping`; сервер — `ready`, `message`, `typing`, `presence`,
`chat_created`, `pong`, `error`. Полное описание — в докстринге `routers/ws.py`.

## Пароли и безопасность

* Пароль: ≥ 8 символов, хотя бы одна `a-z` и одна `0-9` (`validators.validate_password`), максимум 72 байта (предел bcrypt). Сервер возвращает список понятных ошибок.
* Хранение: **bcrypt** (12 раундов, уникальная соль внутри хеша). Для несуществующего логина хеш всё равно проверяется — время ответа не выдаёт наличие аккаунта.
* Вход: JWT HS256 (7 дней), не более 5 неудач за 5 минут на пару IP+логин.
* Доступ: чужие чаты отвечают 404; файл доступен только владельцу и участникам чата, куда он отправлен.
* Загрузки: белый список MIME (SVG исключён), потоковый лимит размера, случайное имя и своё расширение на диске, `nosniff`.
* Шифрование передачи: в продакшене сервер ставится за HTTPS/WSS (nginx/Caddy + TLS 1.2+), токены и пароли по открытому каналу не ходят. Сквозное шифрование (E2E) не входит в Этап 1; схему обсудим на Этапе 5.

## Ограничения MVP

Ограничитель входа хранится в памяти процесса, а менеджер WebSocket — тоже; для нескольких воркеров нужен общий слой (Redis pub/sub). SQLite подходит для одного сервера; схема переносима на PostgreSQL.

---

## Фронтенд (Этапы 2–4)

Запуск: `uvicorn app.main:app` из `backend/`, затем открыть http://127.0.0.1:8000 — сервер отдаёт и API, и `frontend/`.
ES-модули не работают через `file://`, поэтому страницу нужно открывать через сервер.

```
frontend/
├── index.html
├── css/        variables · base · layout · components · animations · icons
├── assets/     icons.svg (источник спрайта), icon-*.png, start.webm
└── js/
    ├── app.js          # точка входа: связывает всё остальное
    ├── api.js          # fetch-обёртка, ApiError
    ├── socket.js       # WebSocket: auth первым сообщением, переподключение, heartbeat
    ├── state.js        # состояние (чаты, история, непрочитанные, «печатает»)
    ├── validators.js   # правила пароля/логина (зеркало серверных)
    ├── haptics.js      # navigator.vibrate с проверкой поддержки
    ├── touch.js        # свайп-назад, долгое нажатие, visualViewport (клавиатура iOS)
    ├── format.js · dom.js · storage.js · config.js
    └── ui/             # auth-view · chat-list · chat-view · composer · modal · toast · avatar
```

Иконки: правьте `assets/icons.svg`, затем `python3 tools/inline_sprite.py`; галерея — `icons-demo.html`.
Тест фронтенда: `tests/frontend_e2e.js` (моки API/WS, Playwright).

---

## Этап 5A: заставка, реакции, голосовые

* **Заставка** — `assets/start.webm` (VP9 с прозрачным фоном: зелёный фон исходного видео вырезан, поэтому приложение видно сразу, а карточка с логотипом играет поверх и плавно растворяется). Показывается раз за сессию вкладки; закрывается по окончании, тапу, ошибке или через несколько секунд; при `prefers-reduced-motion` и в Safari (нет прозрачного WebM) пропускается.
* **Реакции** — `PUT /api/messages/{id}/reactions` `{emoji}` (переключатель), событие WS `reaction`. Список эмодзи: `ALLOWED_REACTIONS` (бэкенд) = `REACTIONS` (`js/config.js`). Открытие меню: ПКМ, двойной клик, долгое нажатие; на телефоне — шторка снизу.
* **Голосовые** — запись `MediaRecorder` (webm/ogg, в Safari mp4), загрузка через `POST /api/media`, затем сообщение с `media_id` и `meta {duration, wave}`; волна рисуется из `meta.wave` без декодирования аудио. Запись работает по HTTPS или на localhost.
* БД: у `messages` новый столбец `meta` (миграция при старте для старых баз).
* Тесты: `tests/frontend_e2e.js` (Этап 4) и `tests/frontend_e2e_5a.js`; общий мок — `tests/mock.js`.

## Этап 5B: файловый менеджер, редактор фото/видео, безопасность
- **Файловый менеджер** (`js/ui/file-manager.js`): папки Фото/Видео/Голосовые/Файлы со счётчиками (`GET /api/media/summary`), сетка последних загрузок, кнопка «С устройства» (скрытый `<input type=file>`).
- **Редактор фото** (`js/editor/photo-editor.js`, `image-ops.js`): кадрирование (рамка с угловыми ручками), поворот, кисть, текст, 7 фильтров, отмена (5 шагов). Результат: Canvas → JPEG Blob → File → FormData.
- **Редактор видео** (`js/editor/video-editor.js`, `video-trim.js`): обрезка начала/конца двумя ручками (в т.ч. с клавиатуры), выбор кадра-обложки. Обрезка перекодирует отрезок через MediaRecorder в реальном времени; без обрезки файл уходит без изменений. Обложка загружается отдельным изображением и привязывается через `cover_id`.
- **Безопасность:** см. `docs/SECURITY.md` (bcrypt, JWT, CSP, описание схемы E2E).
- Тесты: `node tests/frontend_e2e_5b.js` (нужен `python3 -m http.server 8765` в `frontend/`).

## Деплой
См. `DEPLOY.md` (Railway: структура репозитория, Volume `/data`, переменные `AQUA_SECRET_KEY` и `AQUA_DATA_DIR`).
Локально открывать нужно через сервер (`http://127.0.0.1:8000`), а не двойным кликом по `index.html`.

## Android (APK)
См. `android-app/README.md`: APK собирается в GitHub Actions (Capacitor), скачивается с телефона из Releases.

## Действия с сообщениями
Меню сообщения (ПКМ / двойной клик / долгое нажатие) содержит реакции и действия:
- **Копировать** — текст в буфер обмена;
- **Изменить** — только свои текстовые сообщения и подписи к медиа (голосовые менять нельзя), у сообщения появляется метка «изменено»;
- **Удалить у меня** — скрывает любое сообщение только для вас (таблица `message_hidden`);
- **Удалить у всех** — только свои сообщения, требует второго нажатия (удаляются вместе с реакциями; загруженный файл остаётся в «Файлах» автора).

API: `PATCH /api/messages/{id}` (`{"text": ...}`), `DELETE /api/messages/{id}?scope=all|me`. События WebSocket: `message_edited`, `message_deleted` (с актуальным `last_message` для получателя).
Проверка: `node tests/frontend_e2e_msgops.js`, `python3 -I backend/tests/check_message_ops.py`.
