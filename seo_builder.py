#!/usr/bin/env python3
"""
VERITY - Generator warstw SEO, stron statycznych HTTP 200, map witryny i RSS.
Wywoływany automatycznie po każdej aktualizacji bazy przez update_live_news.py.
"""

import hashlib
import html
import json
import os
import re
import shutil
import xml.sax.saxutils
from datetime import datetime, timedelta, timezone

CATEGORIES = [
    ("/Polska", "Polska — wszystkie działy", "Najważniejsze potwierdzone informacje z Polski — weryfikacja krzyżowa z 97 redakcji."),
    ("/Polska/Gospodarka", "Gospodarka i rynek", "Zweryfikowane informacje o gospodarce, finansach, podatkach, giełdzie i biznesie w Polsce."),
    ("/Polska/Polityka", "Polityka i prawo", "Fakty i decyzje legislacyjne z wielu źródeł, bez komentarzy publicystycznych."),
    ("/Polska/Energetyka", "Energetyka i klimat", "Ceny energii, transformacja energetyczna, OZE, gaz i rynek paliw w Polsce."),
    ("/Polska/Poznan", "Poznań i Wielkopolska", "Najważniejsze informacje z Poznania i Wielkopolski — transport, inwestycje i wydarzenia lokalne."),
    ("/Swiat", "Świat i geopolityka", "Potwierdzone depesze ze świata, bezpieczeństwo międzynarodowe, technologie i cyberbezpieczeństwo."),
    ("/Sport", "Sport", "Wyniki, rozgrywki reprezentacji i najważniejsze wydarzenia sportowe w faktograficznym skrócie."),
]

KNOWN_HUES = {
    "gospodarka": 150,
    "polityka": 215,
    "energetyka": 38,
    "poznan": 350,
    "swiat": 265,
    "sport": 15,
    "prawo": 190,
}


def detect_site_base_url(base_dir: str) -> str:
    cname_path = os.path.join(base_dir, "CNAME")
    if os.path.exists(cname_path):
        try:
            with open(cname_path, "r", encoding="utf-8") as f:
                domain = f.read().strip().splitlines()[0].strip()
                if domain:
                    return f"https://{domain}".rstrip("/")
        except Exception:
            pass
    env_url = (os.environ.get("VERITY_SITE_URL") or "").strip().rstrip("/")
    if env_url:
        return env_url
    return "https://hygrisxx.github.io/verity-"


def _norm_pl(text: str) -> str:
    trans = str.maketrans("ąćęłńóśźż", "acelnoszz")
    return (text or "").lower().translate(trans)


def path_hue(path: str) -> int:
    parts = [p for p in (path or "").split("/") if p]
    last = _norm_pl(parts[-1] if parts else "")
    if last in KNOWN_HUES:
        return KNOWN_HUES[last]
    h = 0
    for ch in last:
        h = (h * 31 + ord(ch)) % 360
    return h


def short_cat_label(path: str) -> str:
    pretty = {
        "Swiat": "Świat",
        "Poznan": "Poznań",
        "Krakow": "Kraków",
        "Wroclaw": "Wrocław",
        "Gdansk": "Gdańsk",
        "Lodz": "Łódź",
        "Bialystok": "Białystok",
        "Rzeszow": "Rzeszów",
        "Slask": "Śląsk",
    }
    parts = [pretty.get(p, p) for p in (path or "/Polska").split("/") if p]
    if len(parts) <= 1:
        return parts[0] if parts else "Polska"
    return " · ".join(parts[1:])


def strip_citations(text: str) -> str:
    t = re.sub(r"\[Źródło:\s*[^\]]+\]", "", text or "")
    t = re.sub(r"\[\d+:[^\]]+\]", "", t)
    return re.sub(r"\s{2,}", " ", t).strip()


def pl_typography(text: str) -> str:
    """Dodaje niełamliwe spacje przed wiszącymi spójnikami i jednostkami."""
    t = text or ""
    for _ in range(2):
        t = re.sub(r"(^|[\s(„\"—–-])([aiouwzAIOUWZ]) +", "\\1\\2\u00A0", t)
    t = re.sub(
        r"(\d)[ ]+(r\.|tys\.|mln|mld|proc\.|zł|euro|USD|km|MW|GW|MWh|GWh|osób|osoby|min|lat|lata)(?=$|[\s.,;:!?()„”\"—–-])",
        "\\1\u00A0\\2",
        t,
    )
    return t


def _format_metric_val_html(val: str) -> str:
    return html.escape(val or "").replace("/", "/<wbr>")


def format_citations_html(raw_text: str, perspectives: list) -> str:
    url_by_outlet = {}
    for p in perspectives or []:
        if p and p.get("outlet") and p.get("url"):
            url_by_outlet[p["outlet"].strip()] = p["url"].strip()

    escaped = html.escape(pl_typography(raw_text or ""), quote=True)

    def repl(match):
        raw_list = match.group(1)
        outlets = [s.strip() for s in raw_list.split(",") if s.strip()]
        badges = []
        for name in outlets:
            href = url_by_outlet.get(name)
            if href:
                safe_href = html.escape(href, quote=True)
                badges.append(
                    f'<a class="cite-tag cite-link" href="{safe_href}" target="_blank" '
                    f'rel="noopener noreferrer" title="Otwórz artykuł źródłowy w: {name}">{name} ↗</a>'
                )
            else:
                badges.append(f'<span class="cite-tag">{name}</span>')
        return " ".join(badges)

    return re.sub(r"\[Źródło:\s*([^\]]+)\]", repl, escaped)


def reading_minutes(art: dict) -> int:
    words = " ".join(
        s.get("heading", "") + " " + " ".join(s.get("paragraphs", []))
        for s in (art.get("full_sections") or [])
    ).split()
    return max(1, round(len(words) / 190))


def minutes_label(n: int) -> str:
    if n == 1:
        return "1 minuta czytania"
    if 2 <= n <= 4 or (n > 20 and 2 <= n % 10 <= 4 and not (12 <= n % 100 <= 14)):
        return f"{n} minuty czytania"
    return f"{n} minut czytania"


def sources_label(n: int) -> str:
    if n == 1:
        return "1 źródło"
    if 2 <= n <= 4:
        return f"{n} źródła"
    return f"{n} źródeł"


def count_articles_label(n: int) -> str:
    if n == 1:
        return "1 opracowanie"
    if 2 <= n <= 4 or (n > 20 and 2 <= n % 10 <= 4 and not (12 <= n % 100 <= 14)):
        return f"{n} opracowania"
    return f"{n} opracowań"


def article_lede(art: dict, max_len: int = 240) -> str:
    lead = strip_citations(art.get("summary_lead") or "")
    if not lead:
        secs = art.get("full_sections") or []
        first = secs[0]["paragraphs"][0] if secs and secs[0].get("paragraphs") else ""
        lead = strip_citations(first)
    if len(lead) <= max_len:
        return lead
    cut = lead[:max_len]
    best_stop = -1
    for m in re.finditer(r"[.!?](?:\s|$)", cut):
        pos = m.start()
        if pos < int(max_len * 0.45):
            continue
        before_word = re.findall(r"([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9.]+\.)$", cut[: pos + 1])
        if before_word and before_word[0].lower() in {"m.in.", "np.", "ok.", "godz.", "tys.", "mln.", "mld.", "proc.", "zł.", "r.", "ust.", "art.", "pkt.", "tzw.", "dr.", "prof.", "ul.", "nr.", "woj."}:
            continue
        best_stop = pos + 1
    if best_stop > 0:
        return cut[:best_stop].strip()
    trimmed = re.sub(r"\s+\S*$", "", cut).rstrip(",;:-")
    trimmed = re.sub(r"\s+(?:m\.in|np|ok|tzw|godz)\.$", "", trimmed, flags=re.IGNORECASE)
    return trimmed + "…"


def _clean_outlet_name(name: str) -> str:
    return re.sub(r"\s*\[[^\]]*\]", "", name or "").strip()


def _outlet_monogram(name: str) -> str:
    clean = _clean_outlet_name(name or "V")
    words = [w for w in re.split(r"[\s.\-]+", clean) if w]
    if len(words) >= 2:
        return (words[0][0] + words[1][0]).upper()
    return clean[:2].upper()


def _rel_href(rel_root: str, target_path: str) -> str:
    clean = (target_path or "").strip("/")
    if not clean:
        return rel_root or "./"
    return f"{rel_root}{clean}/"


def _render_nav_html(rel_root: str, active_path: str = "/Polska") -> str:
    items = [
        ("/Polska", "Polska", ""),
        ("/Polska/Gospodarka", "Gospodarka", "Polska / "),
        ("/Polska/Polityka", "Polityka", "Polska / "),
        ("/Polska/Energetyka", "Energetyka", "Polska / "),
        ("/Polska/Poznan", "Poznań", "Polska / "),
    ]
    out = []
    for path, label, prefix in items:
        cls = "path-chip active" if path == active_path else "path-chip"
        href = html.escape(_rel_href(rel_root, path), quote=True)
        inner = f'<span class="path-root">{html.escape(prefix)}</span>{html.escape(label)}' if prefix else html.escape(label)
        out.append(
            f'<a class="{cls}" data-path="{html.escape(path, quote=True)}" '
            f'href="{href}" onclick="return selectPathLink(event, \'{html.escape(path, quote=True)}\')">{inner}</a>'
        )
    out.append('<span class="path-divider" aria-hidden="true">|</span>')
    for path, label in [("/Swiat", "Świat"), ("/Sport", "Sport")]:
        cls = "path-chip active" if path == active_path else "path-chip"
        href = html.escape(_rel_href(rel_root, path), quote=True)
        out.append(
            f'<a class="{cls}" data-path="{html.escape(path, quote=True)}" '
            f'href="{href}" onclick="return selectPathLink(event, \'{html.escape(path, quote=True)}\')">{html.escape(label)}</a>'
        )
    return "\n        ".join(out)


def _render_card_ssr(art: dict, rel_root: str) -> str:
    seo_url = art.get("seo_url") or ""
    href = html.escape(_rel_href(rel_root, seo_url), quote=True)
    raw_title = art.get("seo_title") or ""
    title_attr = html.escape(raw_title, quote=True)
    title_html = html.escape(pl_typography(raw_title))
    cat_label = html.escape(short_cat_label(art.get("path") or "/Polska"))
    date_txt = html.escape(art.get("display_date") or "")
    lede = html.escape(pl_typography(article_lede(art, 200)))
    hue = path_hue(art.get("path") or "/Polska")
    srcs = art.get("sources") or []
    pct = art.get("fact_agreement_pct")
    mins = reading_minutes(art)

    if len(srcs) >= 2 and pct is not None:
        m_cls = "ok" if pct >= 85 else ("mid" if pct >= 70 else "low")
        meter = f'<span class="meter {m_cls}"><span class="meter-bar"><span class="meter-fill" style="width:{pct}%"></span></span>{pct}% zgodności</span>'
    else:
        meter = '<span class="meter neutral">Temat lokalny/niszowy</span>'

    thumb_url = art.get("thumbnail_url") or ""
    no_thumb_cls = "" if thumb_url else " no-thumb"
    img_html = (
        f'<img src="{html.escape(thumb_url, quote=True)}" alt="{title_attr}" class="story-thumb" '
        f'loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add(\'no-thumb\');this.remove()" />'
        if thumb_url
        else ""
    )

    chips = "".join(
        f'<span class="chip" title="{html.escape(m.get("label",""), quote=True)}">{html.escape(m.get("val",""))}</span>'
        for m in (art.get("metrics") or [])[:2]
    )
    js_url = html.escape(seo_url, quote=True)

    return f"""<article class="cat" style="--h:{hue}" data-id="{art['id']}">
      <div class="story-card">
        <a class="card-media-link" href="{href}" onclick="return openArticleLink(event, {art['id']}, '{js_url}')" tabindex="-1" aria-hidden="true">
          <div class="story-thumb-wrap{no_thumb_cls}">
            <div class="thumb-fallback" aria-hidden="true"><span class="thumb-fallback-label">{cat_label}</span><span class="thumb-fallback-mark">V</span></div>
            {img_html}
          </div>
        </a>
        <div class="story-body">
          <div class="story-top"><span class="cat-badge">{cat_label}</span><span class="story-date">{date_txt}</span></div>
          <h2 class="story-title"><a class="story-title-link" href="{href}" onclick="return openArticleLink(event, {art['id']}, '{js_url}')">{title_html}</a></h2>
          <p class="story-lede">{lede}</p>
          {f'<div class="story-chips">{chips}</div>' if chips else ''}
          <div class="story-foot">{meter}<span>{sources_label(len(srcs))} · {mins} min</span></div>
        </div>
      </div>
    </article>"""


def _render_lead_ssr(lead: dict, rel_root: str) -> str:
    seo_url = lead.get("seo_url") or ""
    href = html.escape(_rel_href(rel_root, seo_url), quote=True)
    raw_title = lead.get("seo_title") or ""
    title_attr = html.escape(raw_title, quote=True)
    title_html = html.escape(pl_typography(raw_title))
    cat_label = html.escape(short_cat_label(lead.get("path") or "/Polska"))
    date_txt = html.escape(lead.get("display_date") or "")
    lede = html.escape(pl_typography(article_lede(lead, 290)))
    hue = path_hue(lead.get("path") or "/Polska")
    srcs = lead.get("sources") or []
    pct = lead.get("fact_agreement_pct")
    mins = reading_minutes(lead)

    if len(srcs) >= 2 and pct is not None:
        m_cls = "ok" if pct >= 85 else ("mid" if pct >= 70 else "low")
        meter = f'<span class="meter {m_cls}"><span class="meter-bar"><span class="meter-fill" style="width:{pct}%"></span></span>{pct}% zgodności</span>'
    else:
        meter = '<span class="meter neutral">Temat lokalny/niszowy</span>'

    thumb_url = lead.get("thumbnail_url") or ""
    no_thumb_cls = "" if thumb_url else " no-thumb"
    img_html = (
        f'<img src="{html.escape(thumb_url, quote=True)}" alt="{title_attr}" class="lead-thumb" '
        f'loading="eager" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add(\'no-thumb\');this.closest(\'.lead-story\')?.classList.add(\'no-thumb\');this.remove()" />'
        if thumb_url
        else ""
    )

    stats_rows = "".join(
        f'<div class="stat-row"><span class="stat-label">{html.escape(m.get("label",""))}</span><span class="stat-val">{_format_metric_val_html(m.get("val",""))}</span></div>'
        for m in (lead.get("metrics") or [])[:3]
    )
    js_url = html.escape(seo_url, quote=True)

    return f"""<article class="cat lead-wrap" style="--h:{hue}">
      <div class="lead-story{no_thumb_cls}" onclick="if(!event.target.closest('a'))openArticleLink(event, {lead['id']}, '{js_url}')">
        <a class="lead-thumb-wrap{no_thumb_cls}" href="{href}" onclick="return openArticleLink(event, {lead['id']}, '{js_url}')" tabindex="-1" aria-hidden="true">
          <div class="thumb-fallback" aria-hidden="true"><span class="thumb-fallback-label">{cat_label}</span><span class="thumb-fallback-mark">V</span></div>
          {img_html}
        </a>
        <div class="lead-main">
          <div class="story-top"><span class="cat-badge">{cat_label}</span><span class="story-date">{date_txt}</span></div>
          <h2 class="lead-title"><a class="story-title-link" href="{href}" onclick="return openArticleLink(event, {lead['id']}, '{js_url}')">{title_html}</a></h2>
          <p class="lead-lede">{lede}</p>
          <div class="story-foot">{meter}<span>{sources_label(len(srcs))} · {minutes_label(mins)}</span></div>
        </div>
        <div class="lead-side">
          <div class="lead-side-title">Kluczowe parametry</div>
          {stats_rows}
        </div>
      </div>
    </article>"""


def _sort_articles_for_feed(items: list) -> list:
    return sorted(
        items,
        key=lambda a: (1 if (a.get("declickbait") or []) else 0, a.get("published_iso") or ""),
        reverse=True,
    )


def render_feed_ssr(articles: list, path: str, rel_root: str) -> str:
    filtered = _sort_articles_for_feed(
        [a for a in articles if (a.get("path") or "").startswith(path)]
    )
    title_map = {p: t for p, t, _ in CATEGORIES}
    heading_title = html.escape(title_map.get(path, path))
    heading = f"""<div class="feed-heading">
        <div>
          <span class="feed-crumb">{html.escape(path)}</span>
          <h1>{heading_title}</h1>
        </div>
        <span>{count_articles_label(len(filtered))}</span>
      </div>"""
    if not filtered:
        return heading + f'<div class="empty-state">Brak opracowań w dziale <strong>{html.escape(path)}</strong>.</div>'

    use_lead = len(filtered) >= 3
    lead = filtered[0] if use_lead else None
    rest = filtered[1:16] if use_lead else filtered[:15]
    lead_html = _render_lead_ssr(lead, rel_root) if lead else ""
    cards_html = "\n".join(_render_card_ssr(a, rel_root) for a in rest)
    grid_cls = "cards-grid after-lead" if lead else "cards-grid"
    return heading + lead_html + (f'<div class="{grid_cls}">{cards_html}</div>' if cards_html else "")


def _reconcile_lead_and_first_para(art: dict) -> tuple:
    secs = art.get("full_sections") or []
    all_paras = [(si, pi, p) for si, s in enumerate(secs) for pi, p in enumerate(s.get("paragraphs") or [])]
    if not all_paras:
        lead = strip_citations(art.get("summary_lead") or "")
        return bool(lead), lead, False, ""

    first_raw = all_paras[0][2]
    first_plain = strip_citations(first_raw)
    summary_lead = strip_citations(art.get("summary_lead") or "")
    if not summary_lead and len(all_paras) >= 2:
        summary_lead = article_lede(art, 280)

    norm_l = re.sub(r"\W+", "", summary_lead.lower())
    norm_p = re.sub(r"\W+", "", first_plain.lower())
    if len(all_paras) == 1 and norm_l and norm_p.startswith(norm_l[: min(50, len(norm_l))]):
        return False, "", False, first_raw

    if not summary_lead:
        return False, "", False, first_raw

    if summary_lead.endswith("…"):
        prefix_no_ellip = summary_lead[:-1].rstrip()
        if first_plain.startswith(prefix_no_ellip) and len(first_plain) <= 340:
            return True, first_plain, True, ""

    if norm_l and norm_p and (
        norm_p == norm_l
        or (len(norm_l) > 50 and norm_p.startswith(norm_l[:50]) and len(norm_p) <= len(norm_l) + 30)
    ):
        return True, summary_lead, True, ""

    if not summary_lead.endswith("…") and first_plain.startswith(summary_lead):
        tail_plain = first_plain[len(summary_lead):].strip()
        if len(tail_plain) >= 25 and re.match(r"^[A-ZĄĆĘŁŃÓŚŹŻ„\"—–-]", tail_plain):
            trimmed_raw = first_raw.strip()
            if trimmed_raw.startswith(summary_lead):
                return True, summary_lead, False, trimmed_raw[len(summary_lead):].lstrip()
            cite_suffix = " ".join(re.findall(r"\[Źródło:\s*[^\]]+\]", first_raw))
            return True, summary_lead, False, (f"{tail_plain} {cite_suffix}".strip() if cite_suffix else tail_plain)

    return True, summary_lead, False, first_raw


def _render_article_body_ssr(art: dict, all_articles: list, rel_root: str, site_base_url: str) -> str:
    hue = path_hue(art.get("path") or "/Polska")
    cat_path = art.get("path") or "/Polska"
    title_map = {p: t for p, t, _ in CATEGORIES}
    back_cat = cat_path if cat_path in title_map else "/Polska"
    back_label = html.escape(title_map.get(back_cat, back_cat))
    back_href = html.escape(_rel_href(rel_root, back_cat), quote=True)
    raw_title = art.get("seo_title") or ""
    title_attr = html.escape(raw_title, quote=True)
    title_html = html.escape(pl_typography(raw_title))
    date_esc = html.escape(art.get("display_date") or "")
    mins = reading_minutes(art)
    srcs = art.get("sources") or []
    pct = art.get("fact_agreement_pct")
    persps = art.get("perspectives") or []
    secs = art.get("full_sections") or []

    show_lede, summary_lead, skip_first_para, first_para_override = _reconcile_lead_and_first_para(art)

    lede_html = (
        f'<p class="article-lede">{html.escape(pl_typography(summary_lead))}</p>'
        if show_lede
        else f'<p class="article-context-line">Synteza faktograficzna na podstawie {sources_label(len(srcs))} · Bezpośrednie odnośniki do publikacji źródłowych poniżej.</p>'
    )

    thumb = art.get("thumbnail_url") or ""
    hero_html = ""
    if thumb:
        hero_html = f"""<div class="article-hero-wrap">
            <div class="thumb-fallback" aria-hidden="true"><span class="thumb-fallback-label">{html.escape(short_cat_label(cat_path))}</span><span class="thumb-fallback-mark">V</span></div>
            <img src="{html.escape(thumb, quote=True)}" alt="{title_attr}" class="article-hero-img" loading="eager" referrerpolicy="no-referrer" onerror="this.parentElement.remove()" />
          </div>"""

    facts_html = ""
    if art.get("metrics"):
        boxes = "".join(
            f'<div class="fact-box"><div class="fact-label">{html.escape(m.get("label",""))}</div><div class="fact-val">{_format_metric_val_html(m.get("val",""))}</div></div>'
            for m in art["metrics"]
        )
        facts_html = f'<div class="facts-strip">{boxes}</div>'

    admin_note_html = (
        f'<div class="callout callout-warn"><strong>Nota weryfikacyjna redakcji:</strong> {html.escape(pl_typography(art["admin_note"]))}</div>'
        if art.get("admin_note")
        else ""
    )

    declickbait_html = ""
    if art.get("declickbait"):
        dc_items = "".join(
            f'<div class="cb-item"><div class="cb-strike">„{html.escape(dc.get("original",""))}” <em>— {html.escape(dc.get("outlet",""))}</em></div>'
            f'<div class="cb-fact">→ {html.escape(dc.get("fact",""))}</div></div>'
            for dc in art["declickbait"]
        )
        declickbait_html = f'<div class="callout callout-clickbait"><div class="callout-title">Odfiltrowany clickbait</div>{dc_items}</div>'

    secs_html_parts = []
    dropcap_applied = False
    for si, s in enumerate(secs):
        p_htmls = []
        paras = s.get("paragraphs") or []
        for pi, p in enumerate(paras):
            if si == 0 and pi == 0:
                if skip_first_para:
                    continue
                if first_para_override:
                    p = first_para_override
            plain_p = strip_citations(p)
            is_quote = bool(re.match(r"^\s*[—–-]\s+", plain_p))
            p_classes = ["section-paragraph"]
            if is_quote:
                p_classes.append("is-quote")
                p = re.sub(r"^\s*[—–-]\s+", "—\u00A0", p, count=1)
            elif not dropcap_applied and re.match(r"^[A-ZĄĆĘŁŃÓŚŹŻ]", plain_p) and len(plain_p) >= 140:
                p_classes.append("has-dropcap")
                dropcap_applied = True
            p_htmls.append(f'<p class="{" ".join(p_classes)}">{format_citations_html(p, persps)}</p>')
        if p_htmls:
            secs_html_parts.append(
                f'<section><h2 class="section-heading" id="sec_{art["id"]}_{si}">{html.escape(s.get("heading",""))}</h2>{"".join(p_htmls)}</section>'
            )

    persp_cols = []
    for p in persps:
        link = (
            f'<a class="perspective-link" href="{html.escape(p["url"], quote=True)}" target="_blank" rel="noopener noreferrer">Otwórz artykuł źródłowy ↗</a>'
            if p.get("url")
            else ""
        )
        persp_cols.append(f"""<div class="perspective-col">
          <div class="perspective-head">
            <span class="outlet-mono" aria-hidden="true">{html.escape(_outlet_monogram(p.get("outlet","")))}</span>
            <div>
              <div class="perspective-outlet">{html.escape(p.get("outlet",""))}</div>
              <div class="perspective-angle">{html.escape(p.get("angle") or "Depesza źródłowa")}</div>
            </div>
          </div>
          <p class="perspective-summary">{html.escape(pl_typography(p.get("summary","")))}</p>
          {link}
        </div>""")

    corrs = art.get("corrections") or []
    corr_box_html = ""
    if corrs:
        corr_lines = "".join(
            f'<div>• {html.escape(c.get("claim_text",""))} (<a href="{html.escape(c.get("evidence_url",""), quote=True)}" target="_blank" rel="noopener noreferrer">link</a>)</div>'
            for c in corrs
        )
        corr_box_html = f'<div class="callout callout-success"><strong>Zweryfikowane uzupełnienia czytelników ({len(corrs)}):</strong>{corr_lines}</div>'

    if len(srcs) >= 2 and pct is not None:
        m_cls = "ok" if pct >= 85 else ("mid" if pct >= 70 else "low")
        aside_verif = f"""<div class="aside-card">
            <div class="aside-title">Zgodność danych</div>
            <div class="big-meter meter {m_cls}">{pct}%<small>{sources_label(len(srcs))}</small></div>
            <div class="meter-bar wide"><span class="meter-fill" style="width:{pct}%"></span></div>
          </div>"""
    else:
        aside_verif = """<div class="aside-card">
            <div class="aside-title">Status źródeł</div>
            <div class="aside-status">1 redakcja (lokalne / branżowe)</div>
            <div class="aside-note">Informacja niszowa z pojedynczego źródła — publikowana bez wskaźnika % zgodności krzyżowej.</div>
          </div>"""

    unique_links = []
    seen_u = set()
    for p in persps:
        u = p.get("url")
        if u and u not in seen_u:
            seen_u.add(u)
            unique_links.append(p)

    toc_html = ""
    if len(secs) > 1:
        toc_items = "".join(
            f'<li><button class="toc-btn" onclick="document.getElementById(\'sec_{art["id"]}_{si}\').scrollIntoView({{behavior:\'smooth\'}})"><span>{html.escape(s.get("heading",""))}</span><span>↓</span></button></li>'
            for si, s in enumerate(secs)
        )
        toc_html = f'<div class="aside-card"><div class="aside-title">W tym artykule</div><ul class="aside-list">{toc_items}</ul></div>'

    links_html = ""
    if unique_links:
        link_items = "".join(
            f'<li><a href="{html.escape(p["url"], quote=True)}" target="_blank" rel="noopener noreferrer"><span>{html.escape(_clean_outlet_name(p.get("outlet","")))}</span><span>↗</span></a></li>'
            for p in unique_links
        )
        links_html = f'<div class="aside-card"><div class="aside-title">Źródła do przeczytania</div><ul class="aside-list">{link_items}</ul></div>'

    ordered_all = _sort_articles_for_feed(all_articles)
    top_cat = "/" + (cat_path.strip("/").split("/")[0] or "Polska")
    related = [a for a in ordered_all if a["id"] != art["id"] and a.get("path") == cat_path][:2]
    if len(related) < 2:
        more_top = [a for a in ordered_all if a["id"] != art["id"] and a not in related and (a.get("path") or "").startswith(top_cat)]
        related = (related + more_top)[:2]
    if not related:
        related = [a for a in ordered_all if a["id"] != art["id"]][:2]
    related_html = (
        f'<section class="related"><h2>Czytaj dalej</h2><div class="cards-grid">{"".join(_render_card_ssr(r, rel_root) for r in related)}</div></section>'
        if related
        else ""
    )

    canonical_full = f"{site_base_url}{art.get('seo_url', '')}/"
    canonical_esc = html.escape(canonical_full, quote=True)

    return f"""<div class="cat" style="--h:{hue}">
      <a class="back-link" href="{back_href}" onclick="return selectPathLink(event, '{html.escape(back_cat, quote=True)}')">← Wróć do {back_label}</a>
      <div class="reader has-aside">
        <article class="article-main">
          <header class="article-head">
            <div class="article-kicker">
              <span class="cat-badge">{html.escape(short_cat_label(cat_path))}</span>
              <time datetime="{html.escape(art.get('published_iso') or '')}">{date_esc}</time>
              <span>{minutes_label(mins)}</span>
            </div>
            <h1 class="article-title">{title_html}</h1>
            {lede_html}
          </header>

          {hero_html}
          {facts_html}
          {admin_note_html}
          {declickbait_html}

          <div class="article-sections">
            {"".join(secs_html_parts)}
          </div>

          {f'''<div class="perspectives-box">
            <div class="perspectives-header">
              <span class="perspectives-title">Kto jak to przedstawia?</span>
              <span class="perspectives-sources">Źródła: {html.escape(", ".join(srcs))}</span>
            </div>
            <div class="perspectives-grid">{"".join(persp_cols)}</div>
          </div>''' if persp_cols else ""}

          {corr_box_html}

          <div class="article-footer">
            <div class="permalink-wrap">
              <span class="permalink">{html.escape(canonical_full)}</span>
              <button type="button" class="copy-link-btn" onclick="copyPermalink(this, '{canonical_esc}')" title="Kopiuj link do artykułu">Kopiuj link</button>
            </div>
            <button class="btn-outline" onclick="toggleCorr({art['id']})">Zgłoś sprostowanie (wymagany link do źródła)</button>
          </div>
          <div id="corrDrawer_{art['id']}" class="correction-drawer hidden">
            <div class="corr-intro">Zgłoś korektę faktograficzną – przyjmujemy wyłącznie zgłoszenia z linkiem do dokumentu lub źródła:</div>
            <div class="form-row">
              <input id="corrClaim_{art['id']}" type="text" class="text-input" placeholder="Co wymaga korekty?" />
              <input id="corrUrl_{art['id']}" type="text" class="text-input" placeholder="Link do dowodu: https://..." />
            </div>
            <div class="corr-actions">
              <span id="corrMsg_{art['id']}" class="corr-msg"></span>
              <button class="btn-primary" onclick="submitCorr({art['id']})">Wyślij korektę</button>
            </div>
          </div>
        </article>

        <aside class="article-aside">
          {aside_verif}
          {toc_html}
          {links_html}
        </aside>
      </div>
      {related_html}
    </div>"""


def _build_news_article_jsonld(art: dict, site_base_url: str) -> list:
    canonical = f"{site_base_url}{art.get('seo_url', '')}/"
    cat_path = art.get("path") or "/Polska"
    parts = [p for p in cat_path.split("/") if p]
    valid_cats = {p for p, _, _ in CATEGORIES}
    pretty_names = {"Polska": "Polska", "Swiat": "Świat", "Sport": "Sport", "Gospodarka": "Gospodarka", "Polityka": "Polityka", "Energetyka": "Energetyka", "Poznan": "Poznań"}
    breadcrumbs = [
        {"@type": "ListItem", "position": 1, "name": "VERITY", "item": f"{site_base_url}/"},
    ]
    acc = ""
    for part in parts:
        acc += f"/{part}"
        if acc in valid_cats:
            breadcrumbs.append({"@type": "ListItem", "position": len(breadcrumbs) + 1, "name": pretty_names.get(part, part), "item": f"{site_base_url}{acc}/"})
    breadcrumbs.append({"@type": "ListItem", "position": len(breadcrumbs) + 1, "name": art.get("seo_title") or "", "item": canonical})

    citations = []
    for p in art.get("perspectives") or []:
        if p.get("url"):
            citations.append({
                "@type": "NewsArticle",
                "headline": p.get("summary") or art.get("seo_title") or "",
                "url": p["url"],
                "publisher": {"@type": "Organization", "name": p.get("outlet") or ""},
            })

    news_ld = {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "mainEntityOfPage": {"@type": "WebPage", "@id": canonical},
        "headline": (art.get("seo_title") or "")[:110],
        "description": art.get("meta_description") or article_lede(art, 160),
        "datePublished": art.get("published_iso") or "",
        "dateModified": art.get("published_iso") or "",
        "inLanguage": "pl",
        "isAccessibleForFree": True,
        "articleSection": short_cat_label(cat_path),
        "author": {"@type": "Organization", "name": "Zespół Redakcyjny VERITY", "url": f"{site_base_url}/"},
        "publisher": {"@type": "Organization", "name": "VERITY", "url": f"{site_base_url}/"},
    }
    if art.get("thumbnail_url"):
        news_ld["image"] = [art["thumbnail_url"]]
    if art.get("keywords"):
        news_ld["keywords"] = art["keywords"]
    if citations:
        news_ld["citation"] = citations

    return [
        news_ld,
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": breadcrumbs},
    ]


def _page_shell(
    *,
    title: str,
    description: str,
    canonical_url: str,
    og_type: str,
    og_image: str,
    json_ld_obj,
    rel_root: str,
    active_path: str,
    ssr_main_html: str,
    extra_meta_html: str = "",
    init_script_vars: str = "",
    robots_content: str = "index, follow, max-image-preview:large, max-snippet:-1",
    css_ver: str = "1",
    js_ver: str = "1",
) -> str:
    safe_title = html.escape(title, quote=True)
    safe_desc = html.escape(description, quote=True)
    safe_can = html.escape(canonical_url, quote=True)
    safe_img = html.escape(og_image, quote=True) if og_image else ""
    og_img_tags = (
        f'  <meta property="og:image" content="{safe_img}" />\n  <meta name="twitter:image" content="{safe_img}" />\n'
        if safe_img
        else ""
    )
    tw_card = "summary_large_image" if safe_img else "summary"
    ld_json_str = json.dumps(json_ld_obj, ensure_ascii=False, indent=2).replace("</", "<\\/")
    nav_html = _render_nav_html(rel_root, active_path)

    return f"""<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{safe_title}</title>
  <meta name="description" content="{safe_desc}" />
  <meta name="robots" content="{html.escape(robots_content, quote=True)}" />
  <link rel="canonical" href="{safe_can}" />
{extra_meta_html}
  <meta property="og:type" content="{html.escape(og_type, quote=True)}" />
  <meta property="og:locale" content="pl_PL" />
  <meta property="og:site_name" content="VERITY" />
  <meta property="og:title" content="{safe_title}" />
  <meta property="og:description" content="{safe_desc}" />
  <meta property="og:url" content="{safe_can}" />
{og_img_tags}  <meta name="twitter:card" content="{tw_card}" />
  <meta name="twitter:title" content="{safe_title}" />
  <meta name="twitter:description" content="{safe_desc}" />

  <script id="dynamicJsonLd" type="application/ld+json">
{ld_json_str}
  </script>

  <link rel="alternate" type="application/rss+xml" title="VERITY RSS" href="{html.escape(rel_root, quote=True)}feed.xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,600&display=swap" />
  <link rel="stylesheet" href="{html.escape(rel_root, quote=True)}styles.css?v={html.escape(css_ver, quote=True)}" />
</head>
<body>
  <div id="readingProgress" class="reading-progress" aria-hidden="true"></div>

  <div class="top-utility">
    <div class="container top-utility-inner">
      <div class="top-utility-meta">
        <span id="todayDateLabel" class="top-date">Wydanie bieżące</span>
        <span class="top-sep top-hide-sm" aria-hidden="true"></span>
        <span class="top-hide-sm">Weryfikacja z 97 redakcji</span>
        <span class="top-sep top-hide-sm" aria-hidden="true"></span>
        <span class="top-hide-sm">16 województw · Filtr anty-clickbait</span>
      </div>
      <div class="top-utility-actions">
        <button class="queue-btn" onclick="switchView(currentView === 'public' ? 'editorial' : 'public')">
          Kolejka redakcyjna <span id="pendingBadge" class="queue-count">0</span>
        </button>
      </div>
    </div>
  </div>

  <header class="site-header">
    <div class="container">
      <div class="header-main">
        <a class="brand" href="{html.escape(rel_root or './', quote=True)}" onclick="return selectPathLink(event, '/Polska')">
          <div class="brand-mark">V</div>
          <div>
            <div class="brand-title">VERITY</div>
            <div class="brand-subtitle">Wieloźródłowa weryfikacja i synteza informacji</div>
          </div>
        </a>

        <div class="header-controls">
          <div class="search-box">
            <input
              id="searchInput"
              type="search"
              class="search-input"
              oninput="handleSearchInput()"
              aria-label="Wyszukaj artykuły"
            />
            <button id="clearSearchBtn" class="search-clear hidden" onclick="clearSearch()" title="Wyczyść">✕</button>
          </div>

          <div class="theme-switcher" role="group" aria-label="Wybór motywu kolorystycznego">
            <button id="themeBtn_auto" class="theme-btn active" onclick="applyTheme('auto')" title="Automatycznie dopasuj do motywu urządzenia">Auto</button>
            <button id="themeBtn_light" class="theme-btn" onclick="applyTheme('light')" title="Motyw jasny">Jasny</button>
            <button id="themeBtn_dark" class="theme-btn" onclick="applyTheme('dark')" title="Motyw ciemny">Ciemny</button>
          </div>
        </div>
      </div>

      <nav class="path-nav" aria-label="Kategorie tematyczne">
        {nav_html}
      </nav>
    </div>
  </header>

  <main class="container main-content">
    <section id="viewPublic">
      <div id="articlesFeed" class="articles-stack">
        {ssr_main_html}
      </div>
    </section>

    <section id="viewEditorial" class="hidden">
      <div class="editorial-head">
        <div>
          <h1>Kolejka Weryfikacji Redakcyjnej</h1>
          <p>
            Artykuły wymagające zatwierdzenia z uwagi na rozbieżność między komunikatem instytucji rządowej a twardymi danymi NBP / GUS / NIK.
          </p>
        </div>
        <button class="btn-outline" onclick="switchView('public')">← Wróć do widoku portalu</button>
      </div>
      <div id="editorialQueue" class="articles-stack"></div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="container footer-inner">
      <div class="footer-brand">
        <strong>VERITY</strong>
        <p>Wieloźródłowa weryfikacja faktów z 97 redakcji w Polsce — bez clickbaitu, powtórzeń i opinii publicystycznych, z bezpośrednimi odnośnikami do oryginalnych publikacji.</p>
      </div>
      <div class="footer-links">
        <a href="{html.escape(rel_root, quote=True)}news-sitemap.xml">Mapa Google News (XML)</a>
        <a href="{html.escape(rel_root, quote=True)}sitemap.xml">Sitemap (XML)</a>
        <a href="{html.escape(rel_root, quote=True)}feed.xml">Kanał RSS</a>
        <a href="{html.escape(rel_root, quote=True)}robots.txt">robots.txt</a>
        <a href="{html.escape(rel_root, quote=True)}articles.json">Dane (JSON)</a>
      </div>
    </div>
  </footer>

  <script>{init_script_vars}</script>
  <script src="{html.escape(rel_root, quote=True)}app.js?v={html.escape(js_ver, quote=True)}"></script>
</body>
</html>
"""


def _write_file(path: str, content: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def _asset_hash(path: str) -> str:
    try:
        with open(path, "rb") as f:
            return hashlib.sha1(f.read()).hexdigest()[:8]
    except Exception:
        return "1"


def build_all_seo_artifacts(base_dir: str, articles: list, site_base_url: str = None):
    if not site_base_url:
        site_base_url = detect_site_base_url(base_dir)
    site_base_url = site_base_url.rstrip("/")
    css_ver = _asset_hash(os.path.join(base_dir, "styles.css"))
    js_ver = _asset_hash(os.path.join(base_dir, "app.js"))

    published = _sort_articles_for_feed(
        [a for a in articles if a.get("status", "AUTO_PUBLISHED") == "AUTO_PUBLISHED"]
    )

    # 1. Bezpieczne oczyszczenie poprzednich statycznych folderów kategorii/artykułów
    for top_dir in ("Polska", "Swiat", "Sport"):
        full = os.path.join(base_dir, top_dir)
        if os.path.isdir(full):
            shutil.rmtree(full)

    # 2. Główny index.html (z wstępnie wyrenderowaną listą 15 najnowszych artykułów dla botów i natychmiastowego LCP)
    home_ld = [
        {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "VERITY",
            "url": f"{site_base_url}/",
            "description": "Wieloźródłowa weryfikacja i synteza informacji z 97 redakcji w Polsce.",
        },
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": idx, "name": label, "item": f"{site_base_url}{p}/"}
                for idx, (p, label, _) in enumerate(CATEGORIES[:5], start=1)
            ],
        },
        {
            "@context": "https://schema.org",
            "@type": "ItemList",
            "name": "Najnowsze zweryfikowane opracowania — VERITY",
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": idx,
                    "url": f"{site_base_url}{a['seo_url']}/",
                    "name": a["seo_title"],
                }
                for idx, a in enumerate([x for x in published if (x.get("path") or "").startswith("/Polska")][:15], start=1)
            ],
        },
    ]
    first_thumb = next((a.get("thumbnail_url") for a in published if a.get("thumbnail_url")), "")
    home_html = _page_shell(
        title="VERITY – Wieloźródłowa Weryfikacja i Synteza Informacji",
        description="Wieloźródłowa weryfikacja i synteza informacji z 97 redakcji ogólnopolskich, regionalnych (16 województw) i branżowych. Pełna treść faktograficzna, zero clickbaitu, bezpośrednie linki do źródeł.",
        canonical_url=f"{site_base_url}/",
        og_type="website",
        og_image=first_thumb,
        json_ld_obj=home_ld,
        rel_root="",
        active_path="/Polska",
        ssr_main_html=render_feed_ssr(published, "/Polska", ""),
        init_script_vars=f'window.VERITY_BASE="";window.VERITY_CANONICAL_ORIGIN={json.dumps(site_base_url)};',
        css_ver=css_ver,
        js_ver=js_ver,
    )
    with open(os.path.join(base_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(home_html)

    # 3. Strony kategorii (/Polska/, /Polska/Gospodarka/, /Swiat/, /Sport/ itp.)
    for cat_path, cat_title, cat_desc in CATEGORIES:
        rel_dir = cat_path.strip("/")
        depth = len([p for p in rel_dir.split("/") if p])
        rel_root = "../" * depth
        cat_arts = [a for a in published if (a.get("path") or "").startswith(cat_path)]
        cat_thumb = next((a.get("thumbnail_url") for a in cat_arts if a.get("thumbnail_url")), first_thumb)
        cat_ld = [
            {
                "@context": "https://schema.org",
                "@type": "CollectionPage",
                "name": f"{cat_title} — VERITY",
                "description": cat_desc,
                "url": f"{site_base_url}{cat_path}/",
                "inLanguage": "pl",
            },
            {
                "@context": "https://schema.org",
                "@type": "ItemList",
                "itemListElement": [
                    {
                        "@type": "ListItem",
                        "position": idx,
                        "url": f"{site_base_url}{a['seo_url']}/",
                        "name": a["seo_title"],
                    }
                    for idx, a in enumerate(cat_arts[:15], start=1)
                ],
            },
        ]
        cat_html = _page_shell(
            title=f"{cat_title} — VERITY",
            description=cat_desc,
            canonical_url=f"{site_base_url}{cat_path}/",
            og_type="website",
            og_image=cat_thumb,
            json_ld_obj=cat_ld,
            rel_root=rel_root,
            active_path=cat_path,
            ssr_main_html=render_feed_ssr(published, cat_path, rel_root),
            init_script_vars=f'window.VERITY_BASE={json.dumps(rel_root)};window.VERITY_INITIAL_PATH={json.dumps(cat_path)};window.VERITY_CANONICAL_ORIGIN={json.dumps(site_base_url)};',
            css_ver=css_ver,
            js_ver=js_ver,
        )
        _write_file(os.path.join(base_dir, rel_dir, "index.html"), cat_html)

    # 4. Strony pojedynczych artykułów (prawdziwy HTTP 200 OK dla każdego artykułu!)
    written_urls = set()
    for art in published:
        seo_url = (art.get("seo_url") or "").strip("/")
        if not seo_url or seo_url in written_urls:
            continue
        written_urls.add(seo_url)
        parts = [p for p in seo_url.split("/") if p]
        rel_root = "../" * len(parts)
        cat_path = art.get("path") or "/Polska"
        meta_desc = art.get("meta_description") or article_lede(art, 158)
        extra_meta = (
            f'  <meta property="article:published_time" content="{html.escape(art.get("published_iso") or "", quote=True)}" />\n'
            f'  <meta property="article:section" content="{html.escape(short_cat_label(cat_path), quote=True)}" />\n'
        )
        if art.get("keywords"):
            extra_meta += f'  <meta name="news_keywords" content="{html.escape(art["keywords"], quote=True)}" />\n'

        art_html = _page_shell(
            title=f"{art['seo_title']} — VERITY",
            description=meta_desc,
            canonical_url=f"{site_base_url}/{seo_url}/",
            og_type="article",
            og_image=art.get("thumbnail_url") or "",
            json_ld_obj=_build_news_article_jsonld(art, site_base_url),
            rel_root=rel_root,
            active_path=cat_path if any(c[0] == cat_path for c in CATEGORIES) else "/Polska",
            ssr_main_html=_render_article_body_ssr(art, published, rel_root, site_base_url),
            extra_meta_html=extra_meta,
            init_script_vars=(
                f'window.VERITY_BASE={json.dumps(rel_root)};'
                f'window.VERITY_INITIAL_ARTICLE_URL={json.dumps("/" + seo_url)};'
                f'window.VERITY_CANONICAL_ORIGIN={json.dumps(site_base_url)};'
            ),
            css_ver=css_ver,
            js_ver=js_ver,
        )
        _write_file(os.path.join(base_dir, seo_url, "index.html"), art_html)

    # 5. Strona 404.html (obsługuje też miękkie przekierowania SPA dla zmienionych URL-i)
    from urllib.parse import urlparse
    parsed_base = urlparse(site_base_url)
    root_abs_prefix = (parsed_base.path.rstrip("/") + "/") if parsed_base.path.strip("/") else "/"
    not_found_html = _page_shell(
        title="Strona nie została znaleziona — VERITY",
        description="Wybrany adres nie istnieje lub został przeniesiony. Skorzystaj z wyszukiwarki VERITY lub wróć do najnowszych wiadomości.",
        canonical_url=f"{site_base_url}/",
        og_type="website",
        og_image="",
        json_ld_obj={"@context": "https://schema.org", "@type": "WebPage", "name": "404 — VERITY"},
        rel_root=root_abs_prefix,
        active_path="/Polska",
        ssr_main_html='<div class="empty-state"><h2>Nie znaleziono strony (404)</h2><p style="margin-top:0.5rem">Sprawdź adres lub wróć na stronę główną portalu VERITY.</p></div>',
        init_script_vars=f'window.VERITY_IS_404=true;window.VERITY_BASE={json.dumps(root_abs_prefix)};window.VERITY_CANONICAL_ORIGIN={json.dumps(site_base_url)};',
        robots_content="noindex, follow",
        css_ver=css_ver,
        js_ver=js_ver,
    )
    with open(os.path.join(base_dir, "404.html"), "w", encoding="utf-8") as f:
        f.write(not_found_html)

    # 6. news-sitemap.xml (standard Google News: ostatnie 48h, max 1000 URL-i + <image:image>)
    now_dt = datetime.now(timezone.utc)
    recent_arts = []
    for a in published:
        iso_s = (a.get("published_iso") or "").strip()
        try:
            dt = datetime.fromisoformat(iso_s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone(timedelta(hours=1)))
            if (now_dt - dt.astimezone(timezone.utc)) <= timedelta(hours=48):
                recent_arts.append(a)
        except Exception:
            recent_arts.append(a)
    if not recent_arts:
        recent_arts = published[:50]

    news_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"',
        '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ]
    for a in recent_arts[:1000]:
        loc = xml.sax.saxutils.escape(f"{site_base_url}{a['seo_url']}/")
        title_xml = xml.sax.saxutils.escape((a["seo_title"] or "")[:110])
        news_lines.extend([
            "  <url>",
            f"    <loc>{loc}</loc>",
            "    <news:news>",
            "      <news:publication>",
            "        <news:name>VERITY</news:name>",
            "        <news:language>pl</news:language>",
            "      </news:publication>",
            f"      <news:publication_date>{xml.sax.saxutils.escape(a['published_iso'])}</news:publication_date>",
            f"      <news:title>{title_xml}</news:title>",
            "    </news:news>",
        ])
        if a.get("thumbnail_url"):
            img_loc = xml.sax.saxutils.escape(a["thumbnail_url"])
            news_lines.extend([
                "    <image:image>",
                f"      <image:loc>{img_loc}</image:loc>",
                f"      <image:title>{title_xml}</image:title>",
                "    </image:image>",
            ])
        news_lines.append("  </url>")
    news_lines.append("</urlset>\n")
    with open(os.path.join(base_dir, "news-sitemap.xml"), "w", encoding="utf-8") as f:
        f.write("\n".join(news_lines))

    # 7. Pełna mapa witryny sitemap.xml (strona główna + działy + wszystkie artykuły)
    sitemap_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
        "  <url>",
        f"    <loc>{xml.sax.saxutils.escape(site_base_url + '/')}</loc>",
        f"    <lastmod>{now_dt.strftime('%Y-%m-%dT%H:%M:%SZ')}</lastmod>",
        "    <changefreq>hourly</changefreq>",
        "    <priority>1.0</priority>",
        "  </url>",
    ]
    for cat_path, _, _ in CATEGORIES:
        sitemap_lines.extend([
            "  <url>",
            f"    <loc>{xml.sax.saxutils.escape(f'{site_base_url}{cat_path}/')}</loc>",
            f"    <lastmod>{now_dt.strftime('%Y-%m-%dT%H:%M:%SZ')}</lastmod>",
            "    <changefreq>hourly</changefreq>",
            "    <priority>0.9</priority>",
            "  </url>",
        ])
    for a in published:
        loc = xml.sax.saxutils.escape(f"{site_base_url}{a['seo_url']}/")
        sitemap_lines.extend([
            "  <url>",
            f"    <loc>{loc}</loc>",
            f"    <lastmod>{xml.sax.saxutils.escape(a['published_iso'])}</lastmod>",
            "    <changefreq>daily</changefreq>",
            "    <priority>0.8</priority>",
        ])
        if a.get("thumbnail_url"):
            sitemap_lines.extend([
                "    <image:image>",
                f"      <image:loc>{xml.sax.saxutils.escape(a['thumbnail_url'])}</image:loc>",
                "    </image:image>",
            ])
        sitemap_lines.append("  </url>")
    sitemap_lines.append("</urlset>\n")
    with open(os.path.join(base_dir, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write("\n".join(sitemap_lines))

    # 8. Kanał RSS feed.xml
    rss_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        "  <channel>",
        "    <title>VERITY – Wieloźródłowa Weryfikacja Faktów</title>",
        f"    <link>{xml.sax.saxutils.escape(site_base_url + '/')}</link>",
        f'    <atom:link href="{xml.sax.saxutils.escape(site_base_url + "/feed.xml")}" rel="self" type="application/rss+xml" />',
        "    <description>Synteza faktograficzna z 97 redakcji w Polsce bez clickbaitu i powtórzeń.</description>",
        "    <language>pl</language>",
    ]
    for a in published[:30]:
        link_esc = xml.sax.saxutils.escape(f"{site_base_url}{a['seo_url']}/")
        desc = a.get("meta_description") or article_lede(a, 200)
        rss_lines.extend([
            "    <item>",
            f"      <title>{xml.sax.saxutils.escape(a['seo_title'])}</title>",
            f"      <link>{link_esc}</link>",
            f'      <guid isPermaLink="true">{link_esc}</guid>',
            f"      <category>{xml.sax.saxutils.escape(short_cat_label(a.get('path','/Polska')))}</category>",
            f"      <description>{xml.sax.saxutils.escape(desc)}</description>",
            "    </item>",
        ])
    rss_lines.extend(["  </channel>", "</rss>\n"])
    with open(os.path.join(base_dir, "feed.xml"), "w", encoding="utf-8") as f:
        f.write("\n".join(rss_lines))

    # 9. robots.txt
    robots_txt = (
        "User-agent: *\n"
        "Allow: /\n\n"
        f"Sitemap: {site_base_url}/sitemap.xml\n"
        f"Sitemap: {site_base_url}/news-sitemap.xml\n"
    )
    with open(os.path.join(base_dir, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(robots_txt)

    print(f"[SEO] Wygenerowano strony HTML ({len(written_urls)} artykułów + {len(CATEGORIES)} działów), sitemap.xml, news-sitemap.xml, feed.xml, robots.txt, 404.html")
