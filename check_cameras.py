#!/usr/bin/env python3
"""
Walidator dostępności kamer z pliku cameras.json.

Dla kamer YouTube sprawdza bezpośrednio stronę osadzenia (youtube-nocookie.com/embed/...)
i parsuje embedded_player_response: wymaga status=OK, obecności liveStreamabilityRenderer,
braku displayEndscreen oraz videoDurationSeconds=0 (czyli faktycznie trwającej transmisji LIVE).
Dla external_link sprawdza kod HTTP 2xx/3xx.

Użycie:
  python3 check_cameras.py           # tylko raport
  python3 check_cameras.py --write   # aktualizuje pole "status" ("online" / "offline") w cameras.json
"""

import argparse
import json
import os
import re
import urllib.error
import urllib.request

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
CAMERAS_PATH = os.path.join(ROOT_DIR, "cameras.json")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36"
REFERER = "https://hygrisxx.github.io/"


def check_url_status(url: str, timeout: int = 10) -> tuple[bool, int]:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 200 <= resp.status < 400, resp.status
    except urllib.error.HTTPError as err:
        return False, err.code
    except Exception:
        return False, 0


def check_youtube_embed_live(embed_url: str, timeout: int = 10) -> tuple[bool, str]:
    req = urllib.request.Request(embed_url, headers={"User-Agent": UA, "Referer": REFERER})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError as err:
        return False, f"HTTP {err.code}"
    except Exception as exc:
        return False, str(exc)

    m = re.search(r'"embedded_player_response":"(.*?)","', body)
    if not m:
        return False, "brak embedded_player_response"
    txt = m.group(1).encode().decode("unicode_escape", "ignore")
    st_m = re.search(r'"status":"([^"]+)"', txt)
    status = st_m.group(1) if st_m else "UNKNOWN"
    if status != "OK":
        reason_m = re.search(r'"reason":"([^"]+)"', txt)
        reason = reason_m.group(1) if reason_m else ""
        return False, f"status={status} {reason}".strip()

    has_live = '"liveStreamabilityRenderer"' in txt
    has_endscreen = '"displayEndscreen":true' in txt
    dur_m = re.search(r'"videoDurationSeconds":"?(\d+)"?', txt)
    dur = int(dur_m.group(1)) if dur_m else 0

    if not has_live or has_endscreen or dur > 0:
        return False, f"not live (live={has_live}, endscreen={has_endscreen}, dur={dur}s)"
    return True, "embed OK (LIVE)"


def check_camera(cam: dict) -> tuple[bool, str]:
    ctype = cam.get("type")
    if ctype == "youtube_video":
        vid = cam.get("youtube_video_id")
        return check_youtube_embed_live(f"https://www.youtube-nocookie.com/embed/{vid}")
    if ctype == "youtube_channel":
        ch = cam.get("youtube_channel_id")
        return check_youtube_embed_live(f"https://www.youtube-nocookie.com/embed/live_stream?channel={ch}")
    if ctype == "external_link":
        ext = cam.get("external_url") or cam.get("source_url")
        ok, code = check_url_status(ext)
        return ok, f"HTTP {code}"
    return False, "unknown type"


def main() -> int:
    parser = argparse.ArgumentParser(description="Sprawdź dostępność kamer w cameras.json")
    parser.add_argument("--write", action="store_true", help="Zapisz pole status (online/offline) w cameras.json")
    args = parser.parse_args()

    with open(CAMERAS_PATH, "r", encoding="utf-8") as f:
        cameras = json.load(f)

    changed = False
    ok_count = 0
    for cam in cameras:
        ok, detail = check_camera(cam)
        new_status = "online" if ok else "offline"
        if ok:
            ok_count += 1
        print(f"[{'OK' if ok else 'OFFLINE'}] {cam.get('id')} ({cam.get('type')}): {detail}")
        if args.write and cam.get("status") != new_status:
            cam["status"] = new_status
            changed = True

    if args.write and changed:
        with open(CAMERAS_PATH, "w", encoding="utf-8") as f:
            json.dump(cameras, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"Zaktualizowano {CAMERAS_PATH}.")

    print(f"Podsumowanie: {ok_count}/{len(cameras)} kamer dostępnych.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
