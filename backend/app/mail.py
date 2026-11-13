"""Отправка кодов входа на почту.

Провайдеры пробуются по очереди, пока один не доставит письмо: Resend API (AQUA_RESEND_API_KEY) →
Brevo API (AQUA_BREVO_API_KEY + AQUA_BREVO_FROM) → обычный SMTP (AQUA_SMTP_HOST). Без единого провайдера
письма не уходят; только в AQUA_EMAIL_DEV=1 код печатается в лог вместо отправки.
Каждый сбой пишется в лог с ответом провайдера — по логу Railway видно, почему письмо не ушло."""
import json
import logging
import re
import smtplib
import urllib.error
import urllib.request
from email.message import EmailMessage

from . import config

log = logging.getLogger("aqua.mail")

RESEND_URL = "https://api.resend.com/emails"
BREVO_URL = "https://api.brevo.com/v3/smtp/email"
RESEND_DEFAULT_FROM = "Aqua <onboarding@resend.dev>"
_FROM_RE = re.compile(r"^\s*(?:\"?([^<\"]*?)\"?\s*)?<([^<>@\s]+@[^<>@\s]+)>\s*$")


class MailNotConfigured(Exception):
    """Ни один способ отправки не настроен."""


class MailDeliveryError(Exception):
    """Провайдер настроен, но письмо не доставлено (ключ отклонён, домен не подтверждён, нет сети)."""


def _providers() -> list[tuple[str, callable]]:
    found = []
    if config.RESEND_API_KEY:
        found.append(("resend", _send_via_resend))
    if config.BREVO_API_KEY and config.BREVO_FROM:
        found.append(("brevo", _send_via_brevo))
    if config.SMTP_HOST and config.SMTP_FROM:
        found.append(("smtp", _send_via_smtp))
    return found


def mail_ready() -> bool:
    return bool(_providers()) or config.EMAIL_DEV


def _subject_and_text(code: str, purpose: str) -> tuple[str, str]:
    text = {
        "register": f"Ваш код для регистрации в Aqua: {code}",
        "reset": f"Ваш код для восстановления пароля в Aqua: {code}",
    }.get(purpose, f"Ваш код подтверждения Aqua: {code}")
    subject = f"Код подтверждения Aqua: {code}"
    body = f"{text}\n\nКод действует 10 минут. Если вы не запрашивали код, просто проигнорируйте письмо."
    return subject, body


def _post_json(url: str, headers: dict, payload: dict, provider: str) -> None:
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(), method="POST",
        # Свой User-Agent: по умолчанию urllib шлёт «Python-urllib/…», и Cloudflare (Resend) блокирует его (HTTP 403, error 1010)
        headers={"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "Aqua/1.0", **headers})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status >= 300:
                raise MailDeliveryError(f"{provider}: ответ {resp.status}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:500]
        raise MailDeliveryError(f"{provider}: HTTP {e.code}: {detail}") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise MailDeliveryError(f"{provider}: нет соединения: {e}") from e


def _send_via_resend(to: str, subject: str, text: str) -> None:
    _post_json(RESEND_URL, {"Authorization": f"Bearer {config.RESEND_API_KEY}"}, {
        "from": config.RESEND_FROM or RESEND_DEFAULT_FROM,
        "to": [to], "subject": subject, "text": text}, "resend")


def _send_via_brevo(to: str, subject: str, text: str) -> None:
    m = _FROM_RE.match(config.BREVO_FROM)
    sender = {"name": (m.group(1) or "Aqua").strip() or "Aqua", "email": m.group(2)} if m else {"name": "Aqua", "email": config.BREVO_FROM.strip()}
    _post_json(BREVO_URL, {"api-key": config.BREVO_API_KEY}, {
        "sender": sender, "to": [{"email": to}], "subject": subject, "textContent": text}, "brevo")


def _send_via_smtp(to: str, subject: str, text: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = config.SMTP_FROM
    msg["To"] = to
    msg.set_content(text)
    try:
        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as smtp:
            smtp.starttls()
            if config.SMTP_USER:
                smtp.login(config.SMTP_USER, config.SMTP_PASSWORD)
            smtp.send_message(msg)
    except (smtplib.SMTPException, OSError) as e:
        raise MailDeliveryError(f"smtp: {type(e).__name__}: {e}") from e


def send_login_code(to: str, code: str, purpose: str = "register") -> None:
    subject, text = _subject_and_text(code, purpose)
    providers = _providers()
    if not providers:
        if config.EMAIL_DEV:                       # только для локальной разработки
            log.warning("DEV: код (%s) для %s: %s", purpose, to, code)
            return
        raise MailNotConfigured("Отправка писем не настроена.")
    last_error = None
    for name, send in providers:
        try:
            send(to, subject, text)
            return
        except MailDeliveryError as e:
            last_error = e
            log.error("Почта: письмо не ушло через %s (%s)", name, e)
    raise last_error
