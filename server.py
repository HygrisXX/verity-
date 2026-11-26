#!/usr/bin/env python3
"""
VERITY - Lekki serwer HTTP + API redakcyjne (standardowa biblioteka Pythona).
Służy statyczne pliki portalu (jak GitHub Pages) oraz obsługuje trwały zapis
Kolejki redakcyjnej (Zero-Trust) i zgłoszeń korekt czytelników („Pokaż dowód!”).

Uruchomienie:
    python3 server.py --port 8000
Opcjonalne zabezpieczenie endpointów Admina:
    VERITY_ADMIN_TOKEN=tajny_klucz python3 server.py --port 8000
"""

import argparse
import functools
import http.cookies
import http.server
import json
import os
import posixpath
import sys
import threading
import time
import urllib.parse

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

import community_db as cdb  # noqa: E402
import update_live_news as uln  # noqa: E402

_STATE_LOCK = threading.Lock()
_CHAT_CONDITION = threading.Condition()


class VerityRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Serwer plików statycznych z obsługą endpointów REST /api/* oraz czatu live (SSE)."""

    server_version = "VerityHTTP/1.1"
    protocol_version = "HTTP/1.1"
    rebuild_seo_on_write = True
    db_path = None

    def log_message(self, format, *args):
        if os.environ.get("VERITY_QUIET_SERVER", "") == "1":
            return
        super().log_message(format, *args)

    def _send_json(self, status_code: int, payload: dict, extra_headers: list[tuple[str, str]] | None = None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra_headers or []):
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            length = 0
        if length <= 0 or length > 1_048_576:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        try:
            parsed = json.loads(raw.decode("utf-8"))
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    def _check_admin_auth(self) -> bool:
        expected = os.environ.get("VERITY_ADMIN_TOKEN", "").strip()
        if not expected:
            return True
        header_tok = (self.headers.get("X-Admin-Token") or "").strip()
        auth_hdr = (self.headers.get("Authorization") or "").strip()
        if auth_hdr.lower().startswith("bearer "):
            bearer_tok = auth_hdr[7:].strip()
        else:
            bearer_tok = ""
        return header_tok == expected or bearer_tok == expected

    def _extract_session_token(self) -> str:
        hdr = (self.headers.get("X-Session-Token") or "").strip()
        if hdr:
            return hdr
        auth_hdr = (self.headers.get("Authorization") or "").strip()
        if auth_hdr.lower().startswith("bearer "):
            return auth_hdr[7:].strip()
        cookie_hdr = self.headers.get("Cookie") or ""
        if cookie_hdr:
            c = http.cookies.SimpleCookie()
            try:
                c.load(cookie_hdr)
                if "verity_session" in c:
                    return (c["verity_session"].value or "").strip()
            except Exception:
                pass
        return ""

    def _current_user(self) -> dict | None:
        tok = self._extract_session_token()
        if not tok:
            return None
        return cdb.get_user_by_token(self.directory, tok, db_path=self.db_path)

    def _guest_key(self) -> str:
        gk = (self.headers.get("X-Guest-Id") or "").strip()
        if gk:
            return gk
        addr = self.client_address[0] if self.client_address else "anon"
        return f"ip_{addr}"

    def _count_pending(self, base_dir: str, state: dict) -> tuple:
        pending_arts = 0
        articles_path = os.path.join(base_dir, "articles.json")
        if os.path.isfile(articles_path):
            try:
                with open(articles_path, "r", encoding="utf-8") as f:
                    arts = json.load(f)
                pending_arts = sum(1 for a in arts if a.get("status") == "PENDING_ADMIN")
            except Exception:
                pass
        pending_corrs = sum(
            1
            for c in (state.get("reader_corrections") or [])
            if isinstance(c, dict) and c.get("status") == "PENDING_ADMIN_REVIEW"
        )
        return pending_arts, pending_corrs

    def _handle_chat_sse(self, query_params: dict):
        room = cdb.normalize_room((query_params.get("room") or ["Globalny"])[0])
        try:
            last_id = int((query_params.get("after_id") or [self.headers.get("Last-Event-ID") or "0"])[0] or "0")
        except ValueError:
            last_id = 0

        self.close_connection = True
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        stop_ev = getattr(self.server, "stop_event", None)
        try:
            self.wfile.write(f": connected {room}\n\n".encode("utf-8"))
            self.wfile.flush()
            last_ping = time.monotonic()

            while not (stop_ev and stop_ev.is_set()):
                msgs = cdb.list_chat_messages(self.directory, room=room, after_id=last_id, limit=50, db_path=self.db_path)
                if msgs:
                    for m in msgs:
                        last_id = max(last_id, int(m["id"]))
                        chunk = f"id: {m['id']}\nevent: message\ndata: {json.dumps(m, ensure_ascii=False)}\n\n"
                        self.wfile.write(chunk.encode("utf-8"))
                    self.wfile.flush()
                    last_ping = time.monotonic()

                with _CHAT_CONDITION:
                    _CHAT_CONDITION.wait(timeout=1.5)

                if time.monotonic() - last_ping >= 15.0:
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
                    last_ping = time.monotonic()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        req_path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)
        base_dir = self.directory

        if req_path == "/api/editorial-state":
            with _STATE_LOCK:
                state = uln.load_editorial_state(base_dir)
                pending_arts, pending_corrs = self._count_pending(base_dir, state)
            self._send_json(
                200,
                {
                    "ok": True,
                    "mode": "server",
                    "auth_required": bool(os.environ.get("VERITY_ADMIN_TOKEN", "").strip()),
                    "editorial_state": state,
                    "pending_articles": pending_arts,
                    "pending_corrections": pending_corrs,
                    "pending_total": pending_arts + pending_corrs,
                },
            )
            return

        if req_path == "/api/health":
            cdb.init_db(base_dir, db_path=self.db_path)
            self._send_json(200, {"ok": True, "service": "verity", "community": True})
            return

        if req_path == "/api/auth/me":
            user = self._current_user()
            self._send_json(
                200,
                {
                    "ok": True,
                    "user": user,
                    "guest_cooldown_sec": cdb._cooldown_value("VERITY_GUEST_CHAT_COOLDOWN", cdb.GUEST_CHAT_COOLDOWN_DEFAULT, None),
                },
            )
            return

        if req_path == "/api/community/bootstrap":
            user = self._current_user()
            c_path = (qs.get("path") or ["/Polska"])[0]
            room = (qs.get("room") or [c_path or "Globalny"])[0]
            art_raw = (qs.get("article_id") or [""])[0].strip()
            article_id = int(art_raw) if art_raw.isdigit() else None

            posts = cdb.list_community_posts(base_dir, path=c_path, db_path=self.db_path)
            chat_msgs = cdb.list_chat_messages(base_dir, room=room, db_path=self.db_path)
            comments = cdb.list_comments(base_dir, article_id=article_id, db_path=self.db_path) if article_id else []
            vote_summary = cdb.get_vote_summary(base_dir, article_id=article_id, user=user, db_path=self.db_path) if article_id else None
            mod_log = cdb.list_moderation_log(base_dir, limit=25, db_path=self.db_path)

            self._send_json(
                200,
                {
                    "ok": True,
                    "user": user,
                    "guest_cooldown_sec": cdb._cooldown_value("VERITY_GUEST_CHAT_COOLDOWN", cdb.GUEST_CHAT_COOLDOWN_DEFAULT, None),
                    "user_cooldown_sec": cdb._cooldown_value("VERITY_USER_CHAT_COOLDOWN", cdb.USER_CHAT_COOLDOWN_DEFAULT, None),
                    "chat_room": cdb.normalize_room(room),
                    "chat_messages": chat_msgs,
                    "posts": posts,
                    "comments": comments,
                    "vote_summary": vote_summary,
                    "moderation_log": mod_log,
                    "tariff": list(cdb.PENALTY_TARIFF.values()),
                },
            )
            return

        if req_path == "/api/chat/messages":
            room = (qs.get("room") or ["Globalny"])[0]
            after_raw = (qs.get("after_id") or ["0"])[0]
            after_id = int(after_raw) if after_raw.isdigit() else 0
            msgs = cdb.list_chat_messages(base_dir, room=room, after_id=after_id, db_path=self.db_path)
            self._send_json(200, {"ok": True, "room": cdb.normalize_room(room), "messages": msgs})
            return

        if req_path == "/api/chat/stream":
            self._handle_chat_sse(qs)
            return

        if req_path == "/api/community/posts":
            c_path = (qs.get("path") or ["/Polska"])[0]
            posts = cdb.list_community_posts(base_dir, path=c_path, db_path=self.db_path)
            self._send_json(200, {"ok": True, "path": cdb.normalize_community_path(c_path), "posts": posts})
            return

        if req_path == "/api/comments":
            art_raw = (qs.get("article_id") or ["0"])[0]
            if not art_raw.isdigit():
                self._send_json(400, {"ok": False, "error": "Wymagane article_id."})
                return
            aid = int(art_raw)
            user = self._current_user()
            self._send_json(
                200,
                {
                    "ok": True,
                    "comments": cdb.list_comments(base_dir, aid, db_path=self.db_path),
                    "vote_summary": cdb.get_vote_summary(base_dir, aid, user=user, db_path=self.db_path),
                },
            )
            return

        if req_path == "/api/moderation/log":
            self._send_json(
                200,
                {
                    "ok": True,
                    "log": cdb.list_moderation_log(base_dir, limit=60, db_path=self.db_path),
                    "tariff": list(cdb.PENALTY_TARIFF.values()),
                },
            )
            return

        if req_path == "/api/moderation/tariff":
            self._send_json(200, {"ok": True, "tariff": list(cdb.PENALTY_TARIFF.values())})
            return

        if req_path == "/api/admin/reports":
            if not self._check_admin_auth():
                self._send_json(401, {"ok": False, "error": "Wymagana autoryzacja administratora (X-Admin-Token)."})
                return
            st = (qs.get("status") or ["PENDING"])[0].upper()
            self._send_json(200, {"ok": True, "reports": cdb.list_reports(base_dir, status=st, db_path=self.db_path)})
            return

        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        req_path = parsed.path
        base_dir = self.directory
        data = self._read_json_body()

        if req_path == "/api/auth/login":
            try:
                res = cdb.login_or_register(
                    base_dir,
                    raw_handle=str(data.get("handle") or ""),
                    demo_age_days=int(data.get("demo_age_days") or 0),
                    is_trusted=bool(data.get("is_trusted")),
                    db_path=self.db_path,
                )
                cookie_val = f"verity_session={res['token']}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax"
                self._send_json(200, res, extra_headers=[("Set-Cookie", cookie_val)])
            except PermissionError as err:
                self._send_json(403, {"ok": False, "error": str(err)})
            except ValueError as err:
                self._send_json(400, {"ok": False, "error": str(err)})
            return

        if req_path == "/api/auth/logout":
            tok = self._extract_session_token()
            cdb.logout_token(base_dir, tok, db_path=self.db_path)
            self._send_json(
                200,
                {"ok": True, "user": None},
                extra_headers=[("Set-Cookie", "verity_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")],
            )
            return

        if req_path == "/api/chat/send":
            user = self._current_user()
            try:
                msg = cdb.send_chat_message(
                    base_dir,
                    room=data.get("room"),
                    text=str(data.get("text") or ""),
                    user=user,
                    guest_key=self._guest_key(),
                    db_path=self.db_path,
                )
                with _CHAT_CONDITION:
                    _CHAT_CONDITION.notify_all()
                self._send_json(200, {"ok": True, "message": msg})
            except PermissionError as err:
                self._send_json(429, {"ok": False, "error": str(err)})
            except ValueError as err:
                self._send_json(400, {"ok": False, "error": str(err)})
            return

        if req_path == "/api/community/posts":
            user = self._current_user()
            try:
                post = cdb.create_community_post(
                    base_dir,
                    user=user,
                    path=str(data.get("path") or "/Polska"),
                    post_type=str(data.get("post_type") or "Własna analiza"),
                    text=str(data.get("text") or ""),
                    link_url=str(data.get("link_url") or ""),
                    db_path=self.db_path,
                )
                self._send_json(200, {"ok": True, "post": post})
            except PermissionError as err:
                self._send_json(403, {"ok": False, "error": str(err)})
            except ValueError as err:
                self._send_json(400, {"ok": False, "error": str(err)})
            return

        if req_path == "/api/comments":
            user = self._current_user()
            try:
                art_id = int(data.get("article_id") or 0)
                if art_id <= 0:
                    raise ValueError("Wymagane poprawne article_id.")
                r_id = int(data["reply_to_id"]) if data.get("reply_to_id") else None
                comment = cdb.create_comment(
                    base_dir,
                    user=user,
                    article_id=art_id,
                    text=str(data.get("text") or ""),
                    reply_to_id=r_id,
                    db_path=self.db_path,
                )
                self._send_json(200, {"ok": True, "comment": comment})
            except PermissionError as err:
                self._send_json(403, {"ok": False, "error": str(err)})
            except ValueError as err:
                self._send_json(400, {"ok": False, "error": str(err)})
            return

        if req_path == "/api/votes":
            user = self._current_user()
            try:
                art_id = int(data.get("article_id") or 0)
                if art_id <= 0:
                    raise ValueError("Wymagane poprawne article_id.")
                summary = cdb.toggle_article_vote(
                    base_dir,
                    user=user,
                    article_id=art_id,
                    read_seconds=int(data.get("read_seconds") or 0),
                    from_external_referrer=bool(data.get("from_external")),
                    db_path=self.db_path,
                )
                self._send_json(200, {"ok": True, "vote_summary": summary})
            except PermissionError as err:
                self._send_json(403, {"ok": False, "error": str(err)})
            except ValueError as err:
                self._send_json(400, {"ok": False, "error": str(err)})
            return

        if req_path == "/api/reports":
            user = self._current_user()
            try:
                rep = cdb.submit_report(
                    base_dir,
                    target_type=str(data.get("target_type") or "comment"),
                    target_id=int(data.get("target_id") or 0),
                    tariff_code=str(data.get("tariff_code") or "§2.1"),
                    reason=str(data.get("reason") or ""),
                    reporter=user,
                    db_path=self.db_path,
                )
                self._send_json(200, {"ok": True, "report": rep})
            except ValueError as err:
                self._send_json(400, {"ok": False, "error": str(err)})
            return

        if req_path == "/api/moderation/check":
            import auto_moderator as _am
            verdict = _am.evaluate_content(str(data.get("text") or ""))
            self._send_json(200, {"ok": True, "verdict": verdict.to_dict()})
            return

        if req_path == "/api/corrections":
            with _STATE_LOCK:
                res = uln.submit_reader_correction(
                    base_dir=base_dir,
                    article_id=data.get("article_id"),
                    seo_url=str(data.get("seo_url") or ""),
                    claim_text=str(data.get("claim_text") or ""),
                    evidence_url=str(data.get("evidence_url") or ""),
                    rebuild_seo=self.rebuild_seo_on_write,
                )
            self._send_json(200 if res.get("ok") else 400, res)
            return

        if req_path.startswith("/api/admin/"):
            if not self._check_admin_auth():
                self._send_json(401, {"ok": False, "error": "Wymagana autoryzacja administratora (X-Admin-Token)."})
                return
            try:
                if req_path == "/api/admin/moderation/punish":
                    entry = cdb.apply_moderation_decision(
                        base_dir,
                        account_handle=str(data.get("account_handle") or ""),
                        tariff_code=str(data.get("tariff_code") or "§2.1"),
                        content_excerpt=str(data.get("content_excerpt") or ""),
                        outcome=str(data.get("outcome") or "PUNISHED"),
                        report_id=int(data["report_id"]) if data.get("report_id") else None,
                        target_type=str(data.get("target_type") or "") or None,
                        target_id=int(data["target_id"]) if data.get("target_id") else None,
                        hide_content=bool(data.get("hide_content", True)),
                        db_path=self.db_path,
                    )
                    self._send_json(200, {"ok": True, "entry": entry})
                    return

                with _STATE_LOCK:
                    if req_path == "/api/admin/approve-article":
                        res = uln.admin_approve_article(
                            base_dir=base_dir,
                            article_id=data.get("article_id"),
                            seo_url=str(data.get("seo_url") or ""),
                            admin_note=str(data.get("admin_note") or ""),
                            rebuild_seo=self.rebuild_seo_on_write,
                        )
                    elif req_path == "/api/admin/reject-article":
                        res = uln.admin_reject_article(
                            base_dir=base_dir,
                            article_id=data.get("article_id"),
                            seo_url=str(data.get("seo_url") or ""),
                            rebuild_seo=self.rebuild_seo_on_write,
                        )
                    elif req_path == "/api/admin/moderate-correction":
                        res = uln.admin_moderate_correction(
                            base_dir=base_dir,
                            correction_id=str(data.get("correction_id") or ""),
                            action=str(data.get("action") or "approve"),
                            admin_note=str(data.get("admin_note") or ""),
                            rebuild_seo=self.rebuild_seo_on_write,
                        )
                    else:
                        self._send_json(404, {"ok": False, "error": f"Nieznany endpoint: {req_path}"})
                        return
                self._send_json(200, res)
            except ValueError as err:
                self._send_json(404, {"ok": False, "error": str(err)})
            except Exception as err:
                self._send_json(500, {"ok": False, "error": f"Błąd serwera: {err}"})
            return

        self._send_json(404, {"ok": False, "error": "Nieznany punkt końcowy API."})

    def send_error(self, code, message=None, explain=None):
        if code == 404 and not self.path.startswith("/api/"):
            not_found_path = os.path.join(self.directory, "404.html")
            if os.path.isfile(not_found_path):
                with open(not_found_path, "rb") as f:
                    body = f.read()
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(body)
                return
        super().send_error(code, message, explain)

    def translate_path(self, path: str) -> str:
        clean = urllib.parse.urlparse(path).path
        clean = posixpath.normpath(urllib.parse.unquote(clean))
        rel = clean.lstrip("/")
        if not rel:
            return os.path.join(self.directory, "index.html")
        candidate = os.path.join(self.directory, rel)
        if os.path.isdir(candidate):
            idx = os.path.join(candidate, "index.html")
            if os.path.isfile(idx):
                return idx
        return candidate

    def end_headers(self):
        if self.path.endswith((".json", ".xml")) and not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()


class VerityThreadingHTTPServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, server_address, RequestHandlerClass):
        self.stop_event = threading.Event()
        super().__init__(server_address, RequestHandlerClass)

    def server_close(self):
        self.stop_event.set()
        with _CHAT_CONDITION:
            _CHAT_CONDITION.notify_all()
        super().server_close()


def create_server(
    directory: str = _THIS_DIR,
    host: str = "0.0.0.0",
    port: int = 8000,
    rebuild_seo_on_write: bool = True,
    db_path: str | None = None,
) -> VerityThreadingHTTPServer:
    abs_dir = os.path.abspath(directory)
    cdb.init_db(abs_dir, db_path=db_path)

    class _ConfiguredHandler(VerityRequestHandler):
        pass

    _ConfiguredHandler.rebuild_seo_on_write = rebuild_seo_on_write
    _ConfiguredHandler.db_path = db_path
    handler_cls = functools.partial(_ConfiguredHandler, directory=abs_dir)
    return VerityThreadingHTTPServer((host, port), handler_cls)


def main():
    parser = argparse.ArgumentParser(description="VERITY serwer HTTP + API redakcyjne i społecznościowe")
    parser.add_argument("--host", default="0.0.0.0", help="Adres nasłuchu (domyślnie 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8000, help="Port serwera (domyślnie 8000)")
    parser.add_argument("--dir", default=_THIS_DIR, help="Katalog główny portalu VERITY")
    parser.add_argument("--no-seo-rebuild", action="store_true", help="Pomiń przebudowę statycznych HTML przy zapisach API")
    parser.add_argument("--db", default=None, help="Opcjonalna ścieżka do bazy SQLite społeczności")
    args = parser.parse_args()

    srv = create_server(
        directory=args.dir,
        host=args.host,
        port=args.port,
        rebuild_seo_on_write=not args.no_seo_rebuild,
        db_path=args.db,
    )
    print(f"[VERITY] Serwer działa pod adresem http://{args.host}:{args.port}/ (katalog: {os.path.abspath(args.dir)})")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n[VERITY] Zatrzymano serwer.")
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
