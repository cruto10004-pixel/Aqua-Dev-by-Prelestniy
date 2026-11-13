"""Отправка кодов входа на почту.

Приоритет: Resend API (AQUA_RESEND_API_KEY) → обычный SMTP (AQUA_SMTP_HOST) →
без настройки — только в AQUA_EMAIL_DEV=1 код печатается в лог вместо отправки.
Resend выбран дефолтным провайдером как самый простой в настройке (не нужен
отдельный пароль приложения), но код не завязан на конкретного провайдера —
смена на SMTP не требует правок кода, только переменных окружения."""
import json
import logging
import smtplib
import urllib.error
import urllib.request
from email.message import EmailMessage

from . import config

log = logging.getLogger("aqua.mail")

RESEND_URL = "https://api.resend.com/emails"


class MailNotConfigured(Exception):
    pass


def mail_ready() -> bool:
    return bool(config.RESEND_API_KEY) or bool(config.SMTP_HOST and config.SMTP_FROM) or config.EMAIL_DEV


def _subject_and_text(code: str, purpose: str) -> tuple[str, str]:
    text = {
        "register": f"Ваш код для регистрации в Aqua: {code}",
        "reset": f"Ваш код для восстановления пароля в Aqua: {code}",
    }.get(purpose, f"Ваш код подтверждения Aqua: {code}")
    subject = f"Код подтверждения Aqua: {code}"
    body = f"{text}\n\nКод действует 10 минут. Если вы не запрашивали код, просто проигнорируйте письмо."
    return subject, body


def _send_via_resend(to: str, subject: str, text: str) -> None:
    payload = json.dumps({
        "from": config.RESEND_FROM or "Aqua <onboarding@resend.dev>",
        "to": [to],
        "subject": subject,
        "text": text,
    }).encode()
    req = urllib.request.Request(
        RESEND_URL, data=payload, method="POST",
        headers={"Authorization": f"Bearer {config.RESEND_API_KEY}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status >= 300:
                raise MailNotConfigured(f"Resend ответил {resp.status}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        log.error("Resend: ошибка отправки (%s): %s", e.code, detail)
        raise MailNotConfigured(f"Resend: {e.code}") from e
    except urllib.error.URLError as e:
        log.error("Resend: нет соединения: %s", e)
        raise MailNotConfigured("Resend недоступен") from e


def _send_via_smtp(to: str, subject: str, text: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = config.SMTP_FROM
    msg["To"] = to
    msg.set_content(text)
    with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as smtp:
        smtp.starttls()
        if config.SMTP_USER:
            smtp.login(config.SMTP_USER, config.SMTP_PASSWORD)
        smtp.send_message(msg)


def send_login_code(to: str, code: str, purpose: str = "register") -> None:
    subject, text = _subject_and_text(code, purpose)
    if config.RESEND_API_KEY:
        _send_via_resend(to, subject, text)
        return
    if config.SMTP_HOST:
        _send_via_smtp(to, subject, text)
        return
    if config.EMAIL_DEV:                       # только для локальной разработки
        log.warning("DEV: код (%s) для %s: %s", purpose, to, code)
        return
    raise MailNotConfigured("Отправка писем не настроена.")
