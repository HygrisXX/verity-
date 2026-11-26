#!/usr/bin/env python3
"""
VERITY — Warstwa konfiguracji rynku (oddzielenie danych krajowych/językowych od rdzenia silnika).

Umożliwia przyszłe dodanie dowolnego kraju lub języka wyłącznie przez dopisanie plików
`markets/<kod>.json` oraz `markets/<kod>_feeds.json`, bez modyfikacji logiki agregatora.
"""

from __future__ import annotations

import json
import os

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
MARKETS_DIR = os.path.join(ROOT_DIR, "markets")

DEFAULT_MARKET_CONFIG = {
    "market": "pl",
    "name": "Polska",
    "language": "pl",
    "locale": "pl-PL",
    "timezone": "Europe/Warsaw",
    "currency": "PLN",
    "default_path": "/Polska",
    "feeds_file": "pl_feeds.json",
    "quote_max_chars_per_outlet": 300,
    "quote_max_sentences_per_outlet": 2,
    "single_source_mode": "mention",
    "use_llm_text": False,
    "commercial_mode": False,
    "anonymize_suspects": True,
    "blocked_sources": [],
    "preferred_primary_outlets": [],
}


def get_active_market(market: str | None = None) -> str:
    return (market or os.environ.get("VERITY_MARKET") or "pl").strip().lower()


def load_market_config(market: str | None = None, base_dir: str = ROOT_DIR) -> dict:
    """Ładuje profil rynku z markets/<market>.json (domyślnie pl)."""
    mkt = get_active_market(market)
    cfg = dict(DEFAULT_MARKET_CONFIG)
    cfg["market"] = mkt
    cfg_path = os.path.join(base_dir, "markets", f"{mkt}.json")
    if os.path.isfile(cfg_path):
        try:
            with open(cfg_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                cfg.update(loaded)
        except (OSError, ValueError):
            pass
    return cfg


def load_market_feeds(market: str | None = None, base_dir: str = ROOT_DIR) -> list:
    """
    Ładuje listę kanałów RSS/HTML z pliku wskazanego w profilu rynku (`feeds_file`)
    i automatycznie odfiltrowuje źródła wpisane na listę `blocked_sources`.
    """
    cfg = load_market_config(market=market, base_dir=base_dir)
    feeds_file = (cfg.get("feeds_file") or f"{cfg['market']}_feeds.json").strip()
    feeds_path = os.path.join(base_dir, "markets", feeds_file)
    if not os.path.isfile(feeds_path):
        return []
    try:
        with open(feeds_path, "r", encoding="utf-8") as f:
            feeds = json.load(f)
    except (OSError, ValueError):
        return []
    if not isinstance(feeds, list):
        return []
    blocked = {str(s).strip().lower() for s in (cfg.get("blocked_sources") or []) if str(s).strip()}
    if not blocked:
        return feeds
    return [
        item for item in feeds
        if isinstance(item, dict) and (item.get("name") or "").strip().lower() not in blocked
    ]
