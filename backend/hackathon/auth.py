import base64
import hashlib
import hmac
import json
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import timedelta

from django.utils import timezone


SESSION_COOKIE_NAME = 'app_session'
PBKDF2_ITERATIONS = 260000
SESSION_TTL = timedelta(days=7)


def _b64encode(raw: bytes) -> str:
    return base64.b64encode(raw).decode('ascii')


def _b64decode(val: str) -> bytes:
    return base64.b64decode(val.encode('ascii'))


def hash_password(password: str, *, salt_b64: str | None = None, iterations: int = PBKDF2_ITERATIONS) -> tuple[str, str, int]:
    if salt_b64 is None:
        salt = secrets.token_bytes(16)
        salt_b64 = _b64encode(salt)
    else:
        salt = _b64decode(salt_b64)

    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, iterations)
    return salt_b64, _b64encode(dk), iterations


def verify_password(password: str, *, salt_b64: str, password_hash_b64: str, iterations: int) -> bool:
    _, computed_hash_b64, _ = hash_password(password, salt_b64=salt_b64, iterations=iterations)
    return hmac.compare_digest(computed_hash_b64, password_hash_b64)


def create_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


@dataclass(frozen=True)
class SessionTimes:
    created_at: timezone.datetime
    expires_at: timezone.datetime


def get_session_times() -> SessionTimes:
    created_at = timezone.now()
    return SessionTimes(created_at=created_at, expires_at=created_at + SESSION_TTL)


def create_otp_code(length: int = 6) -> str:
    if length < 4:
        raise ValueError('OTP length too short')
    start = 10 ** (length - 1)
    end = (10**length) - 1
    return str(secrets.randbelow(end - start + 1) + start)


def hash_otp_code(code: str, *, salt_b64: str | None = None, iterations: int = 100000) -> tuple[str, str, int]:
    return hash_password(code, salt_b64=salt_b64, iterations=iterations)


def verify_otp_code(code: str, *, salt_b64: str, otp_hash_b64: str, iterations: int) -> bool:
    return verify_password(code, salt_b64=salt_b64, password_hash_b64=otp_hash_b64, iterations=iterations)


class OtpDispatchError(RuntimeError):
    pass


def dispatch_otp(*, channel: str, identifier: str, otp: str | None = None, display_name: str | None = None) -> None:
    url = (os.getenv('OTP_GATEWAY_URL') or '').strip()
    auth_header = (os.getenv('OTP_GATEWAY_AUTH_HEADER') or '').strip()

    if not url:
        raise OtpDispatchError('Missing OTP_GATEWAY_URL environment variable')
    if channel not in {'whatsapp', 'email'}:
        raise OtpDispatchError('Invalid OTP channel')
    if not identifier:
        raise OtpDispatchError('Missing OTP identifier')

    payload = {
        'GenerateOTP': 'yes',
        'type': channel,
        'email_mobile': identifier,
    }

    headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
    }
    if auth_header:
        headers['Authorization'] = auth_header

    raw = urllib.parse.urlencode(payload).encode('utf-8')
    req = urllib.request.Request(url, data=raw, method='POST', headers=headers)

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            status = getattr(resp, 'status', None) or resp.getcode()
            if status < 200 or status >= 300:
                raise OtpDispatchError(f'OTP gateway returned HTTP {status}')

            body = resp.read().decode('utf-8')
            try:
                payload = json.loads(body)
            except json.JSONDecodeError as exc:
                raise OtpDispatchError('OTP gateway returned invalid JSON') from exc

            if (payload.get('status') or '').strip().lower() != 'success':
                raise OtpDispatchError('OTP gateway did not return success')
    except urllib.error.HTTPError as exc:
        raise OtpDispatchError(f'OTP gateway returned HTTP {exc.code}') from exc
    except urllib.error.URLError as exc:
        raise OtpDispatchError('Unable to reach OTP gateway') from exc


class OtpVerifyError(RuntimeError):
    pass


def verify_otp_via_gateway(*, identifier: str, otp: str) -> bool:
    url = (os.getenv('OTP_GATEWAY_URL') or '').strip()
    auth_header = (os.getenv('OTP_GATEWAY_AUTH_HEADER') or '').strip()

    if not url:
        raise OtpVerifyError('Missing OTP_GATEWAY_URL environment variable')
    if not identifier:
        raise OtpVerifyError('Missing OTP identifier')
    if not otp:
        raise OtpVerifyError('Missing OTP value')

    payload = {
        'login_verfication': 'yes',
        'email_mobile': identifier,
        'otp': otp,
        'password': '',
    }

    headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
    }
    if auth_header:
        headers['Authorization'] = auth_header

    raw = urllib.parse.urlencode(payload).encode('utf-8')
    req = urllib.request.Request(url, data=raw, method='POST', headers=headers)

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            status = getattr(resp, 'status', None) or resp.getcode()
            if status < 200 or status >= 300:
                raise OtpVerifyError(f'OTP gateway returned HTTP {status}')

            body = resp.read().decode('utf-8')
            try:
                payload = json.loads(body)
            except json.JSONDecodeError as exc:
                raise OtpVerifyError('OTP gateway returned invalid JSON') from exc

            return (payload.get('status') or '').strip().lower() == 'success'
    except urllib.error.HTTPError as exc:
        raise OtpVerifyError(f'OTP gateway returned HTTP {exc.code}') from exc
    except urllib.error.URLError as exc:
        raise OtpVerifyError('Unable to reach OTP gateway') from exc
