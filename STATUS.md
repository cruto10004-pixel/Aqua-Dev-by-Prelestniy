# Статус проекта Aqua (для следующего разработчика / Claude)

Стек: FastAPI + WebSocket + SQLite (backend/), vanilla HTML/CSS/JS (frontend/), Capacitor APK через GitHub Actions (android-app/). Деплой: Railway из ветки main. ТЗ из 7 блоков — у владельца (promt.txt).

## Сделано
- Блоки 1–5 ТЗ; временные локальные уведомления с запросом разрешения при входе.
- Нижняя панель (фиксированная, скрыта только в чатах, с анимированной подсветкой), вкладки-страницы вместо модалок.
- Каналы: создание (карандаш-FAB), профиль канала, правка админом, подписчики/админы, ограничение постинга.
- Настройки в стиле Telegram, glass-bubble оформление.
- Авторизация: вход = логин + пароль (`POST /api/auth/login`); регистрация = логин + пароль + почта → код из письма (`POST /api/auth/register/code`, затем `POST /api/auth/register`). Код 6 цифр, 10 мин, 5 попыток, кулдаун 60 с.

## Что нужно сделать владельцу на Railway
1. Задать переменные SMTP: `AQUA_SMTP_HOST`, `AQUA_SMTP_PORT`, `AQUA_SMTP_USER`, `AQUA_SMTP_PASSWORD`, `AQUA_SMTP_FROM`. Без них регистрация отдаёт 503. (`AQUA_EMAIL_DEV=1` — только для отладки, код пишется в лог.)
2. Удалить старые аккаунты без почты: `python backend/tools/purge_legacy_accounts.py` (сначала dry-run, потом `--yes`; делает бэкап БД).

## Не сделано
- Блок 6: выбор чатов в списке, mute, настоящий push (FCM).
- Блок 7: подписка/поиск каналов, кликабельный @username, реакции в каналах, права админов. История канала для новых подписчиков — по решению владельца НЕ делать.
- Вход через Telegram-бота — только обсуждался.
- Не проверено на реальном телефоне/APK; тёмная тема glass визуально не проверена.

## Как проверять
- Бэкенд: `cd backend && for f in tests/check_*.py; do python3 -I $f; done` (тесты со стабами fastapi/bcrypt).
- Фронтенд: `cd frontend && python3 -m http.server 8765 &`, затем `node tests/frontend_e2e*.js` (Playwright, мок API в tests/mock.js). Тест `frontend_e2e_block4.js` иногда флакает на long-press.
- Перед пушем: `git pull --rebase`; после пуша смотреть статус деплоя: `gh api repos/qu31er/Aqua/commits/main/status`. Ломаный импорт в main.py валит деплой — есть `backend/tests/check_main_imports.py`.
