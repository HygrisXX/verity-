#!/usr/bin/env python3
"""
Walidator dostępności kamer z pliku cameras.json.

Dla kamer typu youtube_video sprawdza oEmbed (HTTP 200 = osadzenie dozwolone).
Dla kamer typu youtube_channel sprawdza https://www.youtube.com/channel/<ID>/live.
Dla external_link wykonuje lekkie żądanie HEAD/GET.

Użycie:
  python3 check_cameras.py           # tylko raport
  python3 check_cameras.py --write   # aktualizuje pole "status" ("online" / "offline") w cameras.json
"""

import argparse
import json
import os
import urllib.error
import urllib.request

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
CAMERAS_PATH = os.path.join(ROOT_DIR, "cameras.json")
UA = "VERITY-CameraCheck/1.0"


def check_url_status(url: str, timeout: int = 10) -> tuple[bool, int]:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 200 <= resp.status < 400, resp.status
    except urllib.error.HTTPError as err:
        return False, err.code
    except Exception:
        return False, 0


def check_camera(cam: dict) -> tuple[bool, str]:
    ctype = cam.get("type")
    if ctype == "youtube_video":
        vid = cam.get("youtube_video_id")
        ok, code = check_url_status(f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={vid}&format=json")
        return ok, f"oEmbed HTTP {code}"
    if ctype == "youtube_channel":
        ch = cam.get("youtube_channel_id")
        req = urllib.request.Request(
            f"https://www.youtube.com/channel/{ch}/live",
            headers={"User-Agent": "Mozilla/5.0", "Cookie": "CONSENT=YES+1"},
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = resp.read().decode("utf-8", "ignore")
                is_live = '"isLive":true' in body or '"isLiveNow":true' in body
                return is_live, "live=true" if is_live else "live=false"
        except urllib.error.HTTPError as err:
            return False, f"HTTP {err.code}"
        except Exception as exc:
            return False, str(exc)
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
