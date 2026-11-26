#!/usr/bin/env python3
"""
VERITY — Publiczny Ranking Rzetelności i Clickbaitu Redakcji (`/ranking/`).

Oblicza w pełni automatycznie i deterministycznie metryki redakcji na podstawie bieżącej bazy `articles.json`:
- Liczba tematów (`articles_count`) i udział jako relacja wiodąca (`primary_count`).
- Wskaźnik clickbaitu (`clickbait_pct`): % oryginalnych tytułów redakcji wychwyconych przez filtr anty-clickbait.
- Średnia zgodność z konsensusem wieloźródłowym (`avg_agreement_pct`).
- Liczba rozbieżności liczbowych (`discrepancy_count`).
- Przejrzysty indeks rzetelności VERITY (0–100):
    `0.55 * avg_agreement_pct + 0.35 * (100 - clickbait_pct) + 10 * min(1, articles_count / 6)`
- „Ściana clickbaitu”: żywe przykłady zneutralizowanych tytułów źródłowych z linkami do opracowań.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
RANKING_FILE = os.path.join(ROOT_DIR, "outlet_ranking.json")

_RANKING_CLICKBAIT_RE = re.compile(
    r"(?:"
    r"\bszok\w*\b|\bpilne\b|\bnie\s+uwierzysz\b|\bniesamowit\w*\b|\bmakabra\b|"
    r"\bprosty\s+trik\b|\bmo[żz]e\s+zaskoczy[ćc]\b|\bjedn[aą]\s+rzecz\b|\bwystarczy\s+sprawdzi[ćc]\b|"
    r"\boto\s+(?:pow[oó]d|prawda|dlaczego|kto|lista)\b|\bz\s+ostatniej\s+chwili\b|"
    r"\bekspert\s+wyja[śs]nia\b|\bto\s+powiedzia[łl][a]?\s+o\b|\bwiadomo,\s+co\s+z\b|"
    r"\bwszyscy\s+m[oó]wi[aą]\s+o\b|\bnie\s+zgadniesz\b|\bzobacz,\s+co\b|\bsprawdź,\s+(?:czy|jak|kiedy|co)\b|"
    r"\bwlepia\w*\s+.*kar[eę]\b|\blecą\s+głowy\b|\bna\s+łeb\s+na\s+szyję\b|"
    r"!!|\?\?"
    r")",
    re.IGNORECASE,
)


def compute_outlet_ranking(
    articles: list,
    clickbait_checker=None,
    min_articles: int = 2,
) -> dict:
    """Wylicza statystyki rzetelności i clickbaitu redakcji oraz listę przykładów de-clickbaitu."""
    checker = clickbait_checker if callable(clickbait_checker) else (lambda t: bool(_RANKING_CLICKBAIT_RE.search(t or "")))

    stats = {}
    clickbait_examples = []
    seen_examples = set()
    total_titles = 0
    total_clickbait = 0

    for art in articles or []:
        if art.get("status", "AUTO_PUBLISHED") != "AUTO_PUBLISHED":
            continue
        persps = art.get("perspectives") or []
        pct = art.get("fact_agreement_pct")
        declick_outlets = {}
        for dc in art.get("declickbait") or []:
            o = (dc.get("outlet") or "").strip()
            orig = (dc.get("original") or "").strip()
            fact = (dc.get("fact") or art.get("seo_title") or "").strip()
            if o and orig:
                declick_outlets[o] = orig
                ex_key = (o.lower(), orig.lower())
                if ex_key not in seen_examples and orig.lower() != fact.lower():
                    seen_examples.add(ex_key)
                    clickbait_examples.append({
                        "outlet": o,
                        "original": orig,
                        "fact": fact,
                        "seo_url": art.get("seo_url") or "",
                        "display_date": art.get("display_date") or "",
                    })

        disc_outlets = set()
        for d in art.get("discrepancies") or []:
            for v in d.get("values") or []:
                vo = (v.get("outlet") or "").strip()
                if vo:
                    disc_outlets.add(vo)

        for idx, p in enumerate(persps):
            outlet = (p.get("outlet") or "").strip()
            if not outlet:
                continue
            orig_title = (p.get("summary") or "").strip()
            row = stats.setdefault(outlet, {
                "outlet": outlet,
                "articles_count": 0,
                "multi_source_count": 0,
                "primary_count": 0,
                "clickbait_count": 0,
                "discrepancy_count": 0,
                "_agreement_sum": 0.0,
                "_agreement_n": 0,
            })
            row["articles_count"] += 1
            if idx == 0:
                row["primary_count"] += 1
            if len(persps) >= 2 and isinstance(pct, (int, float)):
                row["multi_source_count"] += 1
                row["_agreement_sum"] += float(pct)
                row["_agreement_n"] += 1
            if outlet in disc_outlets:
                row["discrepancy_count"] += 1

            total_titles += 1
            is_cb = (outlet in declick_outlets) or bool(orig_title and checker(orig_title))
            if is_cb:
                row["clickbait_count"] += 1
                total_clickbait += 1

    ranked = []
    for row in stats.values():
        cnt = row["articles_count"]
        if cnt < min_articles:
            continue
        cb_pct = round((row["clickbait_count"] / cnt) * 100.0, 1)
        avg_agr = round(row["_agreement_sum"] / row["_agreement_n"], 1) if row["_agreement_n"] > 0 else 85.0
        vol_bonus = 10.0 * min(1.0, cnt / 6.0)
        score = round(0.55 * avg_agr + 0.35 * (100.0 - cb_pct) + vol_bonus, 1)
        ranked.append({
            "outlet": row["outlet"],
            "articles_count": cnt,
            "multi_source_count": row["multi_source_count"],
            "primary_count": row["primary_count"],
            "clickbait_count": row["clickbait_count"],
            "clickbait_pct": cb_pct,
            "avg_agreement_pct": avg_agr,
            "discrepancy_count": row["discrepancy_count"],
            "reliability_score": min(100.0, max(0.0, score)),
        })

    ranked.sort(key=lambda r: (-r["reliability_score"], r["clickbait_pct"], -r["articles_count"], r["outlet"]))
    for pos, r in enumerate(ranked, start=1):
        r["rank"] = pos

    avg_cb_all = round((total_clickbait / total_titles) * 100.0, 1) if total_titles else 0.0
    zero_cb_outlets = sum(1 for r in ranked if r["clickbait_count"] == 0)

    return {
        "updated_iso": dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds"),
        "articles_analyzed": len(articles or []),
        "outlets_ranked": len(ranked),
        "zero_clickbait_outlets": zero_cb_outlets,
        "overall_clickbait_pct": avg_cb_all,
        "outlets": ranked,
        "clickbait_examples": clickbait_examples[:18],
    }


def save_outlet_ranking(data: dict, base_dir: str = ROOT_DIR) -> str:
    out_path = os.path.join(base_dir, "outlet_ranking.json")
    tmp = out_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, out_path)
    return out_path


def load_outlet_ranking(base_dir: str = ROOT_DIR) -> dict:
    path = os.path.join(base_dir, "outlet_ranking.json")
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                return data
        except (OSError, ValueError):
            pass
    return {"outlets": [], "clickbait_examples": []}
