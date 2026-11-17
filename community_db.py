#!/usr/bin/env python3
"""
VERITY — Warstwa społeczności, czatu live, ważonego głosowania i rejestru moderacji (SQLite).

- Czyste repozytorium SQL bez zależności zewnętrznych (wyłącznie wbudowany moduł `sqlite3`):
- Hybrydowy model dostępu:
  * Goście: czytanie wszystkiego + czat live w trybie slow-mode bez linków.
  * Zalogowani (1-klik rejestracja bez hasła): szybszy czat, wpisy w 2. kolumnie `/Polska/...`,
    komentarze chronologiczne bez ocen +/- (z cytowaniem) oraz ważone głosy `▲ Podbij temat`.
- Cichy algorytm wagi głosu (staż konta + filtr Anty-Discord dla <15s oraz klastrów rajdowych).
- Jawny Taryfikator Punktowy §1.1–§2.3 z automatycznym wyciszeniem (6 pkt) / blokadą (10 pkt).
"""

from __future__ import annotations

import contextlib
import datetime as dt
import math
import os
import re
import secrets
import sqlite3
import threading
import time
import urllib.parse

DB_FILENAME = "verity_community.db"

MUTE_THRESHOLD_POINTS = 6
BAN_THRESHOLD_POINTS = 10

GUEST_CHAT_COOLDOWN_DEFAULT = 90
USER_CHAT_COOLDOWN_DEFAULT = 3

PENALTY_TARIFF = {
    "§1.1": {
        "code": "§1.1",
        "title": "Spam, flood lub link komercyjny",
        "description": "Masowe powielanie treści, reklamy komercyjne lub flood na czacie live / w komentarzach.",
        "points": 2,
    },
    "§1.2": {
        "code": "§1.2",
        "title": "Koordynacja rajdu lub multikonta",
        "description": "Zorganizowane zwoływanie brygady z zewnętrznych komunikatorów lub zakładanie multikont do manipulacji.",
        "points": 4,
    },
    "§1.3": {
        "code": "§1.3",
        "title": "Phishing, złośliwe linki lub podszywanie",
        "description": "Rozsyłanie fałszywych stron logowania, skracaczy maskujących malware lub podszywanie się pod redakcję.",
        "points": 6,
    },
    "§2.1": {
        "code": "§2.1",
        "title": "Wulgarna obelga personalna",
        "description": "Bezpośrednie wyzwiska, inwektywy ad personam i poniżanie innych uczestników dyskusji.",
        "points": 2,
    },
    "§2.2": {
        "code": "§2.2",
        "title": "Prowokacja nienawiścią / dezorganizacja debaty",
        "description": "Systematyczne rozbijanie dyskusji mową nienawiści lub wulgarnym trollingiem (zero kar za same poglądy).",
        "points": 4,
    },
    "§2.3": {
        "code": "§2.3",
        "title": "Groźby karalne lub doxxing",
        "description": "Grożenie przemocą fizyczną, publikowanie prywatnych adresów, telefonów lub danych osobowych.",
        "points": 10,
    },
}

_URL_IN_TEXT_RE = re.compile(
    r"(?:https?://|ftp://|www\.|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:pl|com|org|net|eu|info|biz|io|gg|me|tv|xyz|ru|de|uk|co)\b)",
    re.IGNORECASE,
)
_HANDLE_RE = re.compile(r"^[A-Za-z0-9_ĄĆĘŁŃÓŚŹŻąćęłńóśźż.-]{3,24}$")

_INIT_LOCK = threading.Lock()


def get_db_path(base_dir: str, db_path: str | None = None) -> str:
    if db_path:
        return db_path
    env_p = (os.environ.get("VERITY_COMMUNITY_DB") or "").strip()
    if env_p:
        return env_p
    return os.path.join(base_dir, DB_FILENAME)


def _now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _now_iso() -> str:
    return _now_utc().replace(microsecond=0).isoformat()


def _parse_iso(ts: str) -> dt.datetime | None:
    raw = (ts or "").strip()
    if not raw:
        return None
    try:
        parsed = dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.astimezone(dt.timezone.utc)
    except Exception:
        return None


def normalize_room(room: str | None) -> str:
    r = (room or "").strip()
    if not r or r.lower() in {"global", "globalny", "/"}:
        return "Globalny"
    if not r.startswith("/"):
        r = "/" + r
    r = re.sub(r"/{2,}", "/", r).rstrip("/")
    return r or "Globalny"


def normalize_community_path(path: str | None) -> str:
    p = (path or "/Polska").strip()
    if not p.startswith("/"):
        p = "/" + p
    p = re.sub(r"/{2,}", "/", p).rstrip("/")
    return p or "/Polska"


def contains_url(text: str) -> bool:
    return bool(_URL_IN_TEXT_RE.search(text or ""))


def sanitize_handle(raw_handle: str) -> str:
    clean = (raw_handle or "").strip().lstrip("@")
    if not clean or not _HANDLE_RE.match(clean):
        raise ValueError("Nazwa konta (@Nick) musi mieć 3–24 znaki (litery, cyfry, _, -, .).")
    return "@" + clean


def _connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=15.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(base_dir: str, db_path: str | None = None, seed_demo: bool = True) -> str:
    resolved = get_db_path(base_dir, db_path)
    os.makedirs(os.path.dirname(os.path.abspath(resolved)), exist_ok=True)
    with _INIT_LOCK:
        with contextlib.closing(_connect(resolved)) as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    handle TEXT UNIQUE NOT NULL COLLATE NOCASE,
                    display_handle TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    penalty_points INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'ACTIVE',
                    muted_until TEXT NOT NULL DEFAULT '',
                    is_trusted INTEGER NOT NULL DEFAULT 0,
                    role TEXT NOT NULL DEFAULT 'USER'
                );

                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS guest_limits (
                    guest_key TEXT PRIMARY KEY,
                    last_chat_ts REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    room TEXT NOT NULL,
                    user_id TEXT,
                    author_handle TEXT NOT NULL,
                    author_kind TEXT NOT NULL,
                    text TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    is_hidden INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_chat_room_id ON chat_messages(room, id);

                CREATE TABLE IF NOT EXISTS community_posts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    path TEXT NOT NULL,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    author_handle TEXT NOT NULL,
                    post_type TEXT NOT NULL,
                    text TEXT NOT NULL,
                    link_url TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    is_hidden INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_posts_path ON community_posts(path, id DESC);

                CREATE TABLE IF NOT EXISTS comments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    article_id INTEGER NOT NULL,
                    seq_num INTEGER NOT NULL,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    author_handle TEXT NOT NULL,
                    reply_to_id INTEGER,
                    reply_to_seq INTEGER,
                    quote_author TEXT NOT NULL DEFAULT '',
                    quote_excerpt TEXT NOT NULL DEFAULT '',
                    text TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    is_hidden INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_comments_article ON comments(article_id, seq_num);

                CREATE TABLE IF NOT EXISTS votes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    article_id INTEGER NOT NULL,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    raw_weight REAL NOT NULL,
                    read_seconds INTEGER NOT NULL DEFAULT 0,
                    from_external INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    UNIQUE(article_id, user_id)
                );
                CREATE INDEX IF NOT EXISTS idx_votes_article ON votes(article_id);

                CREATE TABLE IF NOT EXISTS reports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    target_type TEXT NOT NULL,
                    target_id INTEGER NOT NULL,
                    target_author TEXT NOT NULL,
                    target_excerpt TEXT NOT NULL,
                    tariff_code TEXT NOT NULL,
                    reason TEXT NOT NULL DEFAULT '',
                    reporter_handle TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'PENDING',
                    created_at TEXT NOT NULL,
                    resolved_at TEXT NOT NULL DEFAULT '',
                    decision TEXT NOT NULL DEFAULT ''
                );

                CREATE TABLE IF NOT EXISTS moderation_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    account_handle TEXT NOT NULL,
                    tariff_code TEXT NOT NULL,
                    tariff_label TEXT NOT NULL,
                    content_excerpt TEXT NOT NULL,
                    points_delta INTEGER NOT NULL,
                    total_points INTEGER NOT NULL,
                    decision TEXT NOT NULL,
                    outcome TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS db_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                """
            )
            seeded_row = conn.execute("SELECT value FROM db_meta WHERE key = 'demo_seeded'").fetchone()
            if seeded_row is None:
                if seed_demo:
                    _seed_initial_data(conn)
                    conn.execute("INSERT OR REPLACE INTO db_meta (key, value) VALUES ('demo_seeded', '1')")
                else:
                    conn.execute("INSERT OR REPLACE INTO db_meta (key, value) VALUES ('demo_seeded', '0')")
            conn.commit()
    return resolved


def _seed_initial_data(conn: sqlite3.Connection) -> None:
    now = _now_utc()
    existing_log = conn.execute("SELECT COUNT(*) FROM moderation_log").fetchone()[0]
    if existing_log == 0:
        t1 = (now - dt.timedelta(minutes=42)).replace(microsecond=0).isoformat()
        t2 = (now - dt.timedelta(minutes=18)).replace(microsecond=0).isoformat()
        conn.execute(
            """
            INSERT INTO moderation_log
            (created_at, account_handle, tariff_code, tariff_label, content_excerpt, points_delta, total_points, decision, outcome)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                t2,
                "@Prawica_PL",
                "ODRZUCONO",
                "Zgłoszenie za „poglądy polityczne”",
                "„Ta zmiana podatkowa oznacza wyższe koszty dla samorządów...”",
                0,
                0,
                "ODRZUCONO (Komentarz zostaje — zero kar za poglądy)",
                "REJECTED",
            ),
        )
        conn.execute(
            """
            INSERT INTO moderation_log
            (created_at, account_handle, tariff_code, tariff_label, content_excerpt, points_delta, total_points, decision, outcome)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                t1,
                "@Troll_Konto99",
                "§2.1",
                "§2.1 Wulgarna obelga personalna",
                "„Ty jesteś chory psychicznie i nie umiesz czytać...”",
                2,
                4,
                "+2 pkt karne (4/10)",
                "PUNISHED",
            ),
        )

    existing_users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if existing_users == 0:
        demo_users = [
            (
                "u_analityk84",
                "@Analityk_84",
                "@Analityk_84",
                (now - dt.timedelta(days=540)).replace(microsecond=0).isoformat(),
                0,
                "ACTIVE",
                "",
                1,
                "USER",
            ),
            (
                "u_kierowcawlkp",
                "@Kierowca_WLKP",
                "@Kierowca_WLKP",
                (now - dt.timedelta(days=190)).replace(microsecond=0).isoformat(),
                0,
                "ACTIVE",
                "",
                0,
                "USER",
            ),
            (
                "u_troll99",
                "@Troll_Konto99",
                "@Troll_Konto99",
                (now - dt.timedelta(days=12)).replace(microsecond=0).isoformat(),
                4,
                "ACTIVE",
                "",
                0,
                "USER",
            ),
        ]
        conn.executemany(
            """
            INSERT OR IGNORE INTO users
            (id, handle, display_handle, created_at, penalty_points, status, muted_until, is_trusted, role)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            demo_users,
        )

    existing_posts = conn.execute("SELECT COUNT(*) FROM community_posts").fetchone()[0]
    if existing_posts == 0:
        conn.execute(
            """
            INSERT INTO community_posts (path, user_id, author_handle, post_type, text, link_url, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "/Polska/Gospodarka",
                "u_analityk84",
                "@Analityk_84",
                "Analiza danych",
                "Porównałem miesięczne komunikaty NBP i GUS z ostatniego kwartału — różnice wynikają głównie z koszyka usług regulowanych.",
                "",
                (now - dt.timedelta(minutes=35)).replace(microsecond=0).isoformat(),
            ),
        )
        conn.execute(
            """
            INSERT INTO community_posts (path, user_id, author_handle, post_type, text, link_url, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "/Polska/Regiony/Wielkopolskie",
                "u_kierowcawlkp",
                "@Kierowca_WLKP",
                "Relacja lokalna",
                "W rejonie węzła Rataje i ronda Śródka ruch wrócił do normy po zakończeniu prac MPK.",
                "",
                (now - dt.timedelta(minutes=22)).replace(microsecond=0).isoformat(),
            ),
        )

    existing_chat = conn.execute("SELECT COUNT(*) FROM chat_messages").fetchone()[0]
    if existing_chat == 0:
        conn.execute(
            """
            INSERT INTO chat_messages (room, user_id, author_handle, author_kind, text, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                "Globalny",
                "u_analityk84",
                "@Analityk_84",
                "user",
                "Witaj na czacie live VERITY! Goście mogą pisać w slow-mode (bez linków); pełny dostęp odblokujesz kontem w 1 klik.",
                (now - dt.timedelta(minutes=15)).replace(microsecond=0).isoformat(),
            ),
        )


def _refresh_mute_expiry(conn: sqlite3.Connection, row: sqlite3.Row) -> sqlite3.Row:
    if row["status"] == "MUTED" and row["muted_until"]:
        until = _parse_iso(row["muted_until"])
        if until and _now_utc() >= until:
            conn.execute("UPDATE users SET status = 'ACTIVE', muted_until = '' WHERE id = ?", (row["id"],))
            row = conn.execute("SELECT * FROM users WHERE id = ?", (row["id"],)).fetchone()
    return row


def _user_public_dict(row: sqlite3.Row) -> dict:
    created_dt = _parse_iso(row["created_at"]) or _now_utc()
    age_days = max(0, (_now_utc() - created_dt).days)
    return {
        "id": row["id"],
        "handle": row["display_handle"],
        "created_at": row["created_at"],
        "age_days": age_days,
        "penalty_points": int(row["penalty_points"] or 0),
        "status": row["status"],
        "muted_until": row["muted_until"] or "",
        "is_trusted": bool(row["is_trusted"]),
    }


def _check_user_can_participate(conn: sqlite3.Connection, user_id: str) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        raise PermissionError("Konto użytkownika nie istnieje.")
    row = _refresh_mute_expiry(conn, row)
    if row["status"] == "BANNED":
        raise PermissionError(f"Konto {row['display_handle']} jest zablokowane ({row['penalty_points']} pkt karnych w taryfikatorze).")
    if row["status"] == "MUTED":
        until_txt = row["muted_until"] or "24h"
        raise PermissionError(f"Konto {row['display_handle']} ma tymczasowe wyciszenie do {until_txt} ({row['penalty_points']} pkt).")
    return row


def login_or_register(
    base_dir: str,
    raw_handle: str,
    demo_age_days: int = 0,
    is_trusted: bool = False,
    db_path: str | None = None,
) -> dict:
    resolved = init_db(base_dir, db_path)
    handle = sanitize_handle(raw_handle)
    age_days = max(0, min(3650, int(demo_age_days or 0)))
    created_dt = (_now_utc() - dt.timedelta(days=age_days)).replace(microsecond=0)
    now_dt = _now_utc().replace(microsecond=0)

    with contextlib.closing(_connect(resolved)) as conn:
        row = conn.execute("SELECT * FROM users WHERE handle = ?", (handle,)).fetchone()
        if row:
            row = _refresh_mute_expiry(conn, row)
            if row["status"] == "BANNED":
                raise PermissionError(f"Konto {row['display_handle']} zostało trwale zablokowane za naruszenia taryfikatora.")
            user_id = row["id"]
        else:
            user_id = "u_" + secrets.token_hex(6)
            conn.execute(
                """
                INSERT INTO users (id, handle, display_handle, created_at, penalty_points, status, muted_until, is_trusted, role)
                VALUES (?, ?, ?, ?, 0, 'ACTIVE', '', ?, 'USER')
                """,
                (user_id, handle, handle, created_dt.isoformat(), 1 if is_trusted else 0),
            )
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

        token = secrets.token_urlsafe(24)
        expires = (now_dt + dt.timedelta(days=30)).isoformat()
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token, user_id, now_dt.isoformat(), expires),
        )
        conn.commit()
        return {"ok": True, "token": token, "user": _user_public_dict(row)}


def get_user_by_token(base_dir: str, token: str | None, db_path: str | None = None) -> dict | None:
    tok = (token or "").strip()
    if not tok:
        return None
    resolved = init_db(base_dir, db_path)
    with contextlib.closing(_connect(resolved)) as conn:
        row = conn.execute(
            """
            SELECT u.*, s.expires_at FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
            """,
            (tok,),
        ).fetchone()
        if not row:
            return None
        exp = _parse_iso(row["expires_at"])
        if exp and _now_utc() > exp:
            conn.execute("DELETE FROM sessions WHERE token = ?", (tok,))
            conn.commit()
            return None
        user_row = conn.execute("SELECT * FROM users WHERE id = ?", (row["id"],)).fetchone()
        user_row = _refresh_mute_expiry(conn, user_row)
        conn.commit()
        return _user_public_dict(user_row)


def logout_token(base_dir: str, token: str | None, db_path: str | None = None) -> None:
    tok = (token or "").strip()
    if not tok:
        return
    resolved = init_db(base_dir, db_path)
    with contextlib.closing(_connect(resolved)) as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (tok,))
        conn.commit()


def _cooldown_value(env_name: str, default: int, override: int | None) -> int:
    if override is not None:
        return max(0, int(override))
    raw = (os.environ.get(env_name) or "").strip()
    if raw.isdigit():
        return int(raw)
    return default


def list_chat_messages(
    base_dir: str,
    room: str | None = None,
    after_id: int = 0,
    limit: int = 60,
    db_path: str | None = None,
) -> list[dict]:
    resolved = init_db(base_dir, db_path)
    norm_room = normalize_room(room)
    safe_limit = max(1, min(200, int(limit)))
    with contextlib.closing(_connect(resolved)) as conn:
        if after_id > 0:
            rows = conn.execute(
                """
                SELECT id, room, author_handle, author_kind, text, created_at
                FROM chat_messages
                WHERE is_hidden = 0 AND room = ? AND id > ?
                ORDER BY id ASC
                LIMIT ?
                """,
                (norm_room, int(after_id), safe_limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, room, author_handle, author_kind, text, created_at
                FROM (
                    SELECT id, room, author_handle, author_kind, text, created_at
                    FROM chat_messages
                    WHERE is_hidden = 0 AND room = ?
                    ORDER BY id DESC
                    LIMIT ?
                ) sub
                ORDER BY id ASC
                """,
                (norm_room, safe_limit),
            ).fetchall()
    return [dict(r) for r in rows]


def send_chat_message(
    base_dir: str,
    room: str | None,
    text: str,
    user: dict | None = None,
    guest_key: str = "anon",
    guest_cooldown_sec: int | None = None,
    user_cooldown_sec: int | None = None,
    db_path: str | None = None,
) -> dict:
    resolved = init_db(base_dir, db_path)
    norm_room = normalize_room(room)
    clean_text = re.sub(r"\s+", " ", (text or "").strip())
    if len(clean_text) < 2:
        raise ValueError("Wiadomość na czacie musi mieć co najmniej 2 znaki.")

    now_ts = time.time()
    now_iso = _now_iso()
    g_cool = _cooldown_value("VERITY_GUEST_CHAT_COOLDOWN", GUEST_CHAT_COOLDOWN_DEFAULT, guest_cooldown_sec)
    u_cool = _cooldown_value("VERITY_USER_CHAT_COOLDOWN", USER_CHAT_COOLDOWN_DEFAULT, user_cooldown_sec)

    with contextlib.closing(_connect(resolved)) as conn:
        if user:
            u_row = _check_user_can_participate(conn, user["id"])
            if len(clean_text) > 600:
                raise ValueError("Maksymalna długość wiadomości to 600 znaków.")
            if u_cool > 0:
                last_row = conn.execute(
                    "SELECT created_at FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 1",
                    (u_row["id"],),
                ).fetchone()
                if last_row:
                    last_dt = _parse_iso(last_row["created_at"])
                    if last_dt:
                        elapsed = (_now_utc() - last_dt).total_seconds()
                        if elapsed < u_cool:
                            rem = max(1, int(math.ceil(u_cool - elapsed)))
                            raise PermissionError(f"Odczekaj {rem} s przed kolejną wiadomością.")
            author_handle = u_row["display_handle"]
            author_kind = "user"
            uid = u_row["id"]
        else:
            if len(clean_text) > 400:
                raise ValueError("Goście mogą pisać wiadomości do 400 znaków.")
            if contains_url(clean_text):
                raise ValueError("Goście w trybie slow-mode nie mogą wysyłać linków ani adresów URL. Zaloguj się w 1 klik, aby odblokować pełny czat.")
            g_key = re.sub(r"[^A-Za-z0-9_.:-]", "", (guest_key or "anon"))[:64] or "anon"
            if g_cool > 0:
                lim = conn.execute("SELECT last_chat_ts FROM guest_limits WHERE guest_key = ?", (g_key,)).fetchone()
                if lim:
                    elapsed = now_ts - float(lim["last_chat_ts"])
                    if elapsed < g_cool:
                        rem = max(1, int(math.ceil(g_cool - elapsed)))
                        raise PermissionError(f"Tryb slow-mode dla gości: odczekaj jeszcze {rem} s (lub zaloguj się w 1 klik).")
            conn.execute(
                "INSERT INTO guest_limits (guest_key, last_chat_ts) VALUES (?, ?) ON CONFLICT(guest_key) DO UPDATE SET last_chat_ts = excluded.last_chat_ts",
                (g_key, now_ts),
            )
            suffix = g_key[-4:] if len(g_key) >= 4 else g_key
            author_handle = f"Gość#{suffix}"
            author_kind = "guest"
            uid = None

        cur = conn.execute(
            """
            INSERT INTO chat_messages (room, user_id, author_handle, author_kind, text, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (norm_room, uid, author_handle, author_kind, clean_text, now_iso),
        )
        msg_id = int(cur.lastrowid)
        row = conn.execute(
            "SELECT id, room, author_handle, author_kind, text, created_at FROM chat_messages WHERE id = ?",
            (msg_id,),
        ).fetchone()
        conn.commit()
        return dict(row)


def list_community_posts(base_dir: str, path: str | None = "/Polska", limit: int = 40, db_path: str | None = None) -> list[dict]:
    resolved = init_db(base_dir, db_path)
    norm_p = normalize_community_path(path)
    safe_limit = max(1, min(100, int(limit)))
    with contextlib.closing(_connect(resolved)) as conn:
        rows = conn.execute(
            """
            SELECT id, path, author_handle, post_type, text, link_url, created_at
            FROM community_posts
            WHERE is_hidden = 0 AND (path = ? OR path LIKE ?)
            ORDER BY id DESC
            LIMIT ?
            """,
            (norm_p, norm_p + "/%", safe_limit),
        ).fetchall()
    return [dict(r) for r in rows]


def create_community_post(
    base_dir: str,
    user: dict | None,
    path: str,
    post_type: str,
    text: str,
    link_url: str = "",
    db_path: str | None = None,
) -> dict:
    if not user:
        raise PermissionError("Publikacja w kolumnie „Swobodna Aktywność Ludzi” wymaga konta (1-klik rejestracja).")
    resolved = init_db(base_dir, db_path)
    norm_p = normalize_community_path(path)
    clean_text = re.sub(r"\s+", " ", (text or "").strip())
    if len(clean_text) < 10:
        raise ValueError("Wpis społecznościowy musi mieć co najmniej 10 znaków.")
    if len(clean_text) > 1200:
        raise ValueError("Wpis społecznościowy może mieć maksymalnie 1200 znaków.")

    allowed_types = {"Relacja na żywo", "Własna analiza", "Pytanie do społeczności", "Wrzutka linku", "Relacja lokalna", "Analiza danych"}
    clean_type = (post_type or "").strip()
    if clean_type not in allowed_types:
        clean_type = "Własna analiza"

    clean_link = (link_url or "").strip()
    if clean_link:
        parsed = urllib.parse.urlparse(clean_link)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Opcjonalny link musi być poprawnym adresem https://...")

    with contextlib.closing(_connect(resolved)) as conn:
        u_row = _check_user_can_participate(conn, user["id"])
        now_iso = _now_iso()
        cur = conn.execute(
            """
            INSERT INTO community_posts (path, user_id, author_handle, post_type, text, link_url, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (norm_p, u_row["id"], u_row["display_handle"], clean_type, clean_text, clean_link, now_iso),
        )
        post_id = int(cur.lastrowid)
        row = conn.execute(
            "SELECT id, path, author_handle, post_type, text, link_url, created_at FROM community_posts WHERE id = ?",
            (post_id,),
        ).fetchone()
        conn.commit()
        return dict(row)


def list_comments(base_dir: str, article_id: int, db_path: str | None = None) -> list[dict]:
    resolved = init_db(base_dir, db_path)
    aid = int(article_id)
    with contextlib.closing(_connect(resolved)) as conn:
        rows = conn.execute(
            """
            SELECT id, article_id, seq_num, author_handle, reply_to_id, reply_to_seq, quote_author, quote_excerpt, text, created_at
            FROM comments
            WHERE is_hidden = 0 AND article_id = ?
            ORDER BY seq_num ASC, id ASC
            """,
            (aid,),
        ).fetchall()
    return [dict(r) for r in rows]


def create_comment(
    base_dir: str,
    user: dict | None,
    article_id: int,
    text: str,
    reply_to_id: int | None = None,
    db_path: str | None = None,
) -> dict:
    if not user:
        raise PermissionError("Dodawanie komentarzy wymaga zalogowania (1-klik konto w VERITY).")
    resolved = init_db(base_dir, db_path)
    aid = int(article_id)
    clean_text = re.sub(r"\s+", " ", (text or "").strip())
    if len(clean_text) < 3:
        raise ValueError("Komentarz musi mieć co najmniej 3 znaki.")
    if len(clean_text) > 2000:
        raise ValueError("Komentarz może mieć maksymalnie 2000 znaków.")

    with contextlib.closing(_connect(resolved)) as conn:
        u_row = _check_user_can_participate(conn, user["id"])
        next_seq = int(
            conn.execute("SELECT COALESCE(MAX(seq_num), 0) + 1 FROM comments WHERE article_id = ?", (aid,)).fetchone()[0]
        )
        r_id = None
        r_seq = None
        q_author = ""
        q_excerpt = ""
        if reply_to_id:
            parent = conn.execute(
                "SELECT id, seq_num, author_handle, text FROM comments WHERE id = ? AND article_id = ? AND is_hidden = 0",
                (int(reply_to_id), aid),
            ).fetchone()
            if parent:
                r_id = int(parent["id"])
                r_seq = int(parent["seq_num"])
                q_author = parent["author_handle"]
                raw_p = parent["text"]
                q_excerpt = (raw_p[:140].rstrip() + "…") if len(raw_p) > 140 else raw_p

        now_iso = _now_iso()
        cur = conn.execute(
            """
            INSERT INTO comments
            (article_id, seq_num, user_id, author_handle, reply_to_id, reply_to_seq, quote_author, quote_excerpt, text, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (aid, next_seq, u_row["id"], u_row["display_handle"], r_id, r_seq, q_author, q_excerpt, clean_text, now_iso),
        )
        cid = int(cur.lastrowid)
        row = conn.execute(
            """
            SELECT id, article_id, seq_num, author_handle, reply_to_id, reply_to_seq, quote_author, quote_excerpt, text, created_at
            FROM comments WHERE id = ?
            """,
            (cid,),
        ).fetchone()
        conn.commit()
        return dict(row)


def calculate_silent_vote_weight(
    *,
    account_created_iso: str,
    penalty_points: int = 0,
    is_trusted: bool = False,
    read_seconds: int = 30,
    cluster_voters_count: int = 1,
    from_external_referrer: bool = False,
    now_dt: dt.datetime | None = None,
) -> float:
    """
    Cichy algorytm wagi głosu (ukryty w tle — nigdy nie wyświetla się publicznie jako mnożnik):
    - Staż konta: <7 dni = 0.5x, 7–89 dni = 1.0x, 90–364 dni = 1.5x, >=365 dni = 2.0x, zaufani (czysta kartoteka) = 3.0x.
    - Kara za punkty z taryfikatora: -12% na punkt (min. 0.25x).
    - Filtr Anty-Discord 1 (czas czytania): <15s (lub wejście z linku zewnętrznego bez czytania) tłumi głos o 65% (* 0.35).
    - Filtr Anty-Discord 2 (klaster rajdowy): N kont głosujących synchronicznie w krótkim oknie dzielone przez sqrt(N).
    """
    ref_now = now_dt or _now_utc()
    created_dt = _parse_iso(account_created_iso) or ref_now
    age_days = max(0, (ref_now - created_dt).days)

    if is_trusted and int(penalty_points or 0) == 0:
        base_weight = 3.0
    elif age_days >= 365:
        base_weight = 2.0
    elif age_days >= 90:
        base_weight = 1.5
    elif age_days >= 7:
        base_weight = 1.0
    else:
        base_weight = 0.5

    pts = max(0, int(penalty_points or 0))
    if pts > 0:
        base_weight *= max(0.25, 1.0 - pts * 0.12)

    r_sec = max(0, int(read_seconds or 0))
    if r_sec < 15 or (from_external_referrer and r_sec < 20):
        base_weight *= 0.35

    cluster_n = max(1, int(cluster_voters_count or 1))
    if cluster_n > 1:
        base_weight /= math.sqrt(cluster_n)

    return round(max(0.05, min(3.0, base_weight)), 4)


def get_vote_summary(base_dir: str, article_id: int, user: dict | None = None, db_path: str | None = None) -> dict:
    """Zwraca wyłącznie zagregowany licznik bez ujawniania surowych wag poszczególnych kont."""
    resolved = init_db(base_dir, db_path)
    aid = int(article_id)
    with contextlib.closing(_connect(resolved)) as conn:
        agg = conn.execute(
            "SELECT COUNT(*) AS cnt, COALESCE(SUM(raw_weight), 0.0) AS total_w FROM votes WHERE article_id = ?",
            (aid,),
        ).fetchone()
        user_voted = False
        if user:
            hit = conn.execute(
                "SELECT 1 FROM votes WHERE article_id = ? AND user_id = ?",
                (aid, user["id"]),
            ).fetchone()
            user_voted = bool(hit)
    cnt = int(agg["cnt"] or 0)
    total_w = float(agg["total_w"] or 0.0)
    # Publiczny licznik zaokrąglony, nigdy nie zdradza pojedynczych wag ułamkowych
    display_score = int(round(total_w)) if total_w > 0 else 0
    if cnt > 0 and display_score == 0:
        display_score = 1
    return {
        "article_id": aid,
        "display_score": display_score,
        "total_voters": cnt,
        "user_voted": user_voted,
    }


def toggle_article_vote(
    base_dir: str,
    user: dict | None,
    article_id: int,
    read_seconds: int = 30,
    from_external_referrer: bool = False,
    db_path: str | None = None,
) -> dict:
    if not user:
        raise PermissionError("Podbijanie tematów (`▲ Podbij temat`) wymaga konta (1-klik logowanie).")
    resolved = init_db(base_dir, db_path)
    aid = int(article_id)
    with contextlib.closing(_connect(resolved)) as conn:
        u_row = _check_user_can_participate(conn, user["id"])
        existing = conn.execute(
            "SELECT id FROM votes WHERE article_id = ? AND user_id = ?",
            (aid, u_row["id"]),
        ).fetchone()
        if existing:
            conn.execute("DELETE FROM votes WHERE id = ?", (existing["id"],))
            conn.commit()
        else:
            # Wykryj zsynchronizowaną falę z zewnętrznego linku / krótkiego czasu czytania (klaster rajdowy z ostatnich 120s)
            cutoff = (_now_utc() - dt.timedelta(seconds=120)).replace(microsecond=0).isoformat()
            burst_cnt = int(
                conn.execute(
                    """
                    SELECT COUNT(*) FROM votes
                    WHERE article_id = ? AND created_at >= ? AND (read_seconds < 15 OR from_external = 1)
                    """,
                    (aid, cutoff),
                ).fetchone()[0]
            )
            cluster_n = (burst_cnt + 1) if (int(read_seconds or 0) < 15 or from_external_referrer) else 1
            weight = calculate_silent_vote_weight(
                account_created_iso=u_row["created_at"],
                penalty_points=int(u_row["penalty_points"] or 0),
                is_trusted=bool(u_row["is_trusted"]),
                read_seconds=int(read_seconds or 0),
                cluster_voters_count=cluster_n,
                from_external_referrer=bool(from_external_referrer),
            )
            conn.execute(
                """
                INSERT INTO votes (article_id, user_id, raw_weight, read_seconds, from_external, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (aid, u_row["id"], weight, int(read_seconds or 0), 1 if from_external_referrer else 0, _now_iso()),
            )
            conn.commit()
    return get_vote_summary(base_dir, aid, user=user, db_path=db_path)


def submit_report(
    base_dir: str,
    target_type: str,
    target_id: int,
    tariff_code: str,
    reason: str = "",
    reporter: dict | None = None,
    db_path: str | None = None,
) -> dict:
    resolved = init_db(base_dir, db_path)
    t_type = (target_type or "").strip().lower()
    if t_type not in {"comment", "post", "chat"}:
        raise ValueError("Nieobsługiwany typ zgłoszenia (comment/post/chat).")
    t_code = (tariff_code or "§2.1").strip()
    if t_code not in PENALTY_TARIFF:
        t_code = "§2.1"

    table = {"comment": "comments", "post": "community_posts", "chat": "chat_messages"}[t_type]
    with contextlib.closing(_connect(resolved)) as conn:
        target = conn.execute(f"SELECT id, author_handle, text FROM {table} WHERE id = ?", (int(target_id),)).fetchone()
        if not target:
            raise ValueError("Zgłaszana treść nie istnieje.")
        excerpt = target["text"]
        if len(excerpt) > 160:
            excerpt = excerpt[:160].rstrip() + "…"
        rep_handle = reporter["handle"] if reporter else "Czytelnik"
        now_iso = _now_iso()
        cur = conn.execute(
            """
            INSERT INTO reports (target_type, target_id, target_author, target_excerpt, tariff_code, reason, reporter_handle, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
            """,
            (t_type, int(target_id), target["author_handle"], excerpt, t_code, (reason or "").strip()[:300], rep_handle, now_iso),
        )
        rep_id = int(cur.lastrowid)
        row = conn.execute("SELECT * FROM reports WHERE id = ?", (rep_id,)).fetchone()
        conn.commit()
        return dict(row)


def list_reports(base_dir: str, status: str = "PENDING", db_path: str | None = None) -> list[dict]:
    resolved = init_db(base_dir, db_path)
    with contextlib.closing(_connect(resolved)) as conn:
        if status == "ALL":
            rows = conn.execute("SELECT * FROM reports ORDER BY id DESC LIMIT 100").fetchall()
        else:
            rows = conn.execute("SELECT * FROM reports WHERE status = ? ORDER BY id DESC LIMIT 100", (status,)).fetchall()
    return [dict(r) for r in rows]


def apply_moderation_decision(
    base_dir: str,
    *,
    account_handle: str,
    tariff_code: str,
    content_excerpt: str,
    outcome: str = "PUNISHED",
    report_id: int | None = None,
    target_type: str | None = None,
    target_id: int | None = None,
    hide_content: bool = True,
    db_path: str | None = None,
) -> dict:
    """
    Rejestruje jawną decyzję moderacji zgodnie z Taryfikatorem (§1.1–§2.3) albo ODRZUCA zgłoszenie
    (np. zgłoszenie za poglądy polityczne = 0 pkt, treść zostaje).
    """
    resolved = init_db(base_dir, db_path)
    clean_handle = sanitize_handle(account_handle)
    norm_outcome = "REJECTED" if str(outcome).upper() == "REJECTED" else "PUNISHED"
    t_code = (tariff_code or "§2.1").strip()
    now_dt = _now_utc().replace(microsecond=0)
    now_iso = now_dt.isoformat()

    with contextlib.closing(_connect(resolved)) as conn:
        u_row = conn.execute("SELECT * FROM users WHERE handle = ?", (clean_handle,)).fetchone()
        if not u_row:
            uid = "u_" + secrets.token_hex(6)
            conn.execute(
                """
                INSERT INTO users (id, handle, display_handle, created_at, penalty_points, status, muted_until, is_trusted, role)
                VALUES (?, ?, ?, ?, 0, 'ACTIVE', '', 0, 'USER')
                """,
                (uid, clean_handle, clean_handle, now_iso),
            )
            u_row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()

        if norm_outcome == "REJECTED":
            pts_delta = 0
            total_pts = int(u_row["penalty_points"] or 0)
            t_label = "Zgłoszenie za „poglądy polityczne” / brak naruszenia"
            decision_txt = "ODRZUCONO (Treść zostaje — brak naruszenia taryfikatora)"
        else:
            rule = PENALTY_TARIFF.get(t_code)
            if not rule:
                raise ValueError(f"Nieznany kod taryfikatora: {t_code}. Dopuszczalne: {', '.join(PENALTY_TARIFF)}")
            pts_delta = int(rule["points"])
            total_pts = int(u_row["penalty_points"] or 0) + pts_delta
            t_label = f"{rule['code']} {rule['title']}"
            new_status = u_row["status"]
            muted_until = u_row["muted_until"] or ""
            if total_pts >= BAN_THRESHOLD_POINTS:
                new_status = "BANNED"
                muted_until = ""
                decision_txt = f"+{pts_delta} pkt ({total_pts}/{BAN_THRESHOLD_POINTS}) → BLOKADA KONTA"
            elif total_pts >= MUTE_THRESHOLD_POINTS:
                new_status = "MUTED"
                muted_until = (now_dt + dt.timedelta(hours=24)).isoformat()
                decision_txt = f"+{pts_delta} pkt ({total_pts}/{BAN_THRESHOLD_POINTS}) → WYCISZENIE 24h"
            else:
                decision_txt = f"+{pts_delta} pkt karne ({total_pts}/{BAN_THRESHOLD_POINTS})"
            conn.execute(
                "UPDATE users SET penalty_points = ?, status = ?, muted_until = ? WHERE id = ?",
                (total_pts, new_status, muted_until, u_row["id"]),
            )
            if hide_content and target_type in {"comment", "post", "chat"} and target_id:
                tbl = {"comment": "comments", "post": "community_posts", "chat": "chat_messages"}[target_type]
                conn.execute(f"UPDATE {tbl} SET is_hidden = 1 WHERE id = ?", (int(target_id),))

        clean_excerpt = (content_excerpt or "").strip()
        if len(clean_excerpt) > 180:
            clean_excerpt = clean_excerpt[:180].rstrip() + "…"
        cur = conn.execute(
            """
            INSERT INTO moderation_log
            (created_at, account_handle, tariff_code, tariff_label, content_excerpt, points_delta, total_points, decision, outcome)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                now_iso,
                u_row["display_handle"],
                t_code if norm_outcome == "PUNISHED" else "ODRZUCONO",
                t_label,
                clean_excerpt or "—",
                pts_delta,
                total_pts,
                decision_txt,
                norm_outcome,
            ),
        )
        log_id = int(cur.lastrowid)
        if report_id:
            conn.execute(
                "UPDATE reports SET status = 'RESOLVED', resolved_at = ?, decision = ? WHERE id = ?",
                (now_iso, decision_txt, int(report_id)),
            )
        log_row = conn.execute("SELECT * FROM moderation_log WHERE id = ?", (log_id,)).fetchone()
        conn.commit()
        return dict(log_row)


def list_moderation_log(base_dir: str, limit: int = 50, db_path: str | None = None) -> list[dict]:
    resolved = init_db(base_dir, db_path)
    safe_limit = max(1, min(200, int(limit)))
    with contextlib.closing(_connect(resolved)) as conn:
        rows = conn.execute(
            "SELECT * FROM moderation_log ORDER BY id DESC LIMIT ?",
            (safe_limit,),
        ).fetchall()
    return [dict(r) for r in rows]
