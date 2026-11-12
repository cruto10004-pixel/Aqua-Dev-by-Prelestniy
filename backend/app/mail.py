"""Отправка кодов входа на почту. Без настроенного SMTP письма не уходят."""
import logging
import smtplib
from email.message import EmailMessage

from . import config

log = logging.getLogger("aqua.mail")


class MailNotConfigured(Exception):
    pass


def mail_ready() -> bool:
    return bool(config.SMTP_HOST and config.SMTP_FROM) or config.EMAIL_DEV


def send_login_code(to: str, code: str) -> None:
    if not config.SMTP_HOST:
        if config.EMAIL_DEV:                       # только для локальной разработки
            log.warning("DEV: код входа для %s: %s", to, code)
            return
        raise MailNotConfigured("Отправка писем не настроена.")
    msg = EmailMessage()
    msg["Subject"] = f"Код подтверждения Aqua: {code}"
    msg["From"] = config.SMTP_FROM
    msg["To"] = to
    msg.set_content(
        f"Ваш код для регистрации в Aqua: {code}\n\n"
        f"Код действует 10 минут. Если вы не запрашивали код, просто проигнорируйте письмо.")
    with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as smtp:
        smtp.starttls()
        if config.SMTP_USER:
            smtp.login(config.SMTP_USER, config.SMTP_PASSWORD)
        smtp.send_message(msg)
