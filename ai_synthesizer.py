#!/usr/bin/env python3
"""
VERITY - Warstwa opcjonalnej syntezy AI (Gemini Free Tier) z regułą Zero-Trust,
lokalnym przed-filtrem / bezpiecznikiem kosztowym (Krok 3) oraz deterministycznym
silnikiem porównawczym „Eksponuje / Pomija” i optymalizacją tytułów SEO (Krok 4).

Zasady bezpieczeństwa:
- Domyślny tryb deterministyczny (0,00 zł) działa bez klucza API i nigdy nie halucynuje.
- Gdy ustawiony jest GEMINI_API_KEY (i nie wyłączono VERITY_USE_GEMINI=0), warstwa LLM
  uruchamia się wyłącznie RAZ dla nowych/zaktualizowanych tematów wieloźródłowych,
  pilnując dziennego limitu Free Tier i twardej walidacji liczb ze źródeł (Zero-Trust).
"""

import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime

DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite"
DEFAULT_MAX_CALLS_PER_RUN = 6
DEFAULT_MAX_DAILY_CALLS = 180
DEFAULT_TIMEOUT_SEC = 18

_POLISH_TRANS = str.maketrans("ąćęłńóśźżĄĆĘŁŃÓŚŹŻ", "acelnoszzACELNOSZZ")

_STOP_FOCUS = {
    "oraz", "ktory", "ktora", "ktore", "ktorych", "ktorej", "ktorym", "ktorymi", "przez", "przed",
    "wedlug", "informuje", "podaje", "pisze", "wskazuje", "zaznacza", "dodaje", "podkresla",
    "nowe", "nowy", "nowa", "nowych", "bedzie", "beda", "maja", "mial", "miala", "mieli", "moga", "moze",
    "sprawie", "polsce", "polski", "polska", "polskie", "polskich", "kraju", "roku", "dnia", "dzisiaj",
    "wczoraj", "jutro", "jeszcze", "tylko", "takze", "rowniez", "ponad", "okolo", "tego", "tym", "tych",
    "jest", "bylo", "byla", "byli", "byly", "zostal", "zostala", "zostaly", "redakcja", "redakcji",
    "zrodlo", "zrodla", "artykul", "depesza", "serwisu", "wiadomosci", "pierwsze", "informacje",
    "relacja", "szczegoly", "analiza", "komunikat", "jednak", "miedzy", "podczas", "zdaniem",
    "wszystkich", "pierwszych", "kolejnych", "dotyczy", "poniewaz", "dlatego", "natomiast",
    "wsrod", "wobec", "wokol", "czesc", "wiecej", "bardzo", "ktorego", "ktoremu", "mozna", "trzeba",
    "kazdy", "kazda", "kazde", "swoim", "swojej", "swoich", "ktora", "ktory", "ktore",
}

_CLICKBAIT_GUARD_RE = re.compile(
    r"(?:"
    r"\bszok\w*\b|\bpilne\b|\bzobacz\b|\bnie\s+uwierzysz\b|\bniesamowit\w*\b|\bmakabra\b|\btragedia\b|"
    r"\bprosty\s+trik\b|\bmo[żz]e\s+zaskoczy[ćc]\b|\bjedn[aą]\s+rzecz\b|\bwystarczy\s+sprawdzi[ćc]\b|"
    r"\boto\s+(?:pow[oó]d|prawda|dlaczego|kto|mistrzyni\w*|mistrz\w*|komplet|wyniki|sk[łl]ad|lista)\b|"
    r"\bzag[łl]osuj\s+w\s+sondzie\b|\bsprawd[źz]\s+wyniki\b|\bpodaj\s+dalej\b|\bz\s+ostatniej\s+chwili\b|"
    r"\bekspert\s+wyja[śs]nia\b|\bwykracza\s+poza\s+sport\b|\bto\s+powiedzia[łl][a]?\s+o\b|\bwiadomo,\s+co\s+z\b|"
    r"\bwszyscy\s+m[oó]wi[aą]\s+o\b|[–—-]\s*(?:foto|wideo|video)\s*$|"
    r"!!|\?\?"
    r")",
    re.IGNORECASE,
)

_NUM_UNIT_RE = re.compile(
    r"(?<![\d.,:/-])(?:"
    r"\d+(?:[.,]\d+)?\s*(?:%|(?:proc\.?|mld\s*zł|mln\s*zł|tys\.\s*zł|mld|mln|tys\.|zł/MWh|zł|EUR|USD|euro|lat|lata|za|przeciw|osób|osoby|posłów|zastępów|zastępy|MW|GW|km)(?![A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]))"
    r"|20[2-4]\d"
    r")(?!\d|[:.,]\d)",
    re.IGNORECASE,
)


def _norm_ascii(text: str) -> str:
    return (text or "").translate(_POLISH_TRANS).lower()


def _extract_meaningful_tokens(text: str) -> list:
    words = re.findall(r"[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9-]{4,}", text or "")
    out = []
    seen = set()
    for w in words:
        nw = _norm_ascii(w)
        if nw in _STOP_FOCUS or nw.isdigit():
            continue
        stem = nw[:7] if len(nw) > 7 else nw
        if stem not in seen:
            seen.add(stem)
            out.append((stem, w.strip("-")))
    return out


def _extract_concrete_figures(text: str) -> list:
    """Wyciąga konkretne liczby z kontekstem/jednostką (np. 234 za, 6,2 mld zł, 2,8 proc., 2027)."""
    found = []
    seen = set()
    for m in _NUM_UNIT_RE.finditer(text or ""):
        val = re.sub(r"\s+", " ", m.group(0).strip())
        digits = re.sub(r"\D", "", val)
        if not digits:
            continue
        norm_key = val.lower().replace(" ", "")
        if norm_key not in seen:
            seen.add(norm_key)
            found.append(val)
    return found


def _extract_raw_numbers(text: str) -> set:
    return set(re.findall(r"\b\d+\b", text or ""))


def _outlet_source_corpus(art: dict, candidates: list) -> dict:
    """Buduje mapę tekstu przypisanego do każdej redakcji (tytuł + akapity z [Źródło: ...])."""
    by_outlet = {}
    for c in candidates or []:
        out = (c.get("outlet") or "").strip()
        if not out:
            continue
        parts = [c.get("title") or "", c.get("description") or "", c.get("excl_description") or ""]
        by_outlet.setdefault(out, []).extend(p for p in parts if p)

    for s in art.get("full_sections") or []:
        heading = s.get("heading") or ""
        explicit_single = ""
        if heading.startswith("Relacja źródłowa (") and heading.endswith(")"):
            explicit_single = heading[len("Relacja źródłowa ("):-1].strip()
        for raw_p in s.get("paragraphs") or []:
            m = re.search(r"\[Źródło:\s*([^\]]+)\]\s*$", raw_p)
            plain = re.sub(r"\[Źródło:\s*[^\]]+\]\s*$", "", raw_p).strip()
            if not plain:
                continue
            if m:
                outs = [o.strip() for o in m.group(1).split(",") if o.strip()]
            elif explicit_single:
                outs = [explicit_single]
            else:
                outs = (art.get("sources") or [])[:1]
            for o in outs:
                by_outlet.setdefault(o, []).append(plain)

    return {out: " ".join(chunks) for out, chunks in by_outlet.items()}


def compute_comparative_perspectives(
    art: dict,
    candidates: list | None = None,
    perspectives: list | None = None,
) -> list:
    """
    Deterministyczna (0,00 zł) analiza porównawcza dla ramki „Kto jak to przedstawia?”:
    Dla każdej redakcji w wieloźródłowym opracowaniu wylicza pola:
      - focus: co dana redakcja eksponuje (unikalne liczby, akcenty, główny wątek),
      - omits: co pomija względem pozostałych źródeł w tym samym temacie.
    Zachowuje bez zmian pola `outlet`, `angle`, `summary` oraz `url`.
    """
    persps = [dict(p) for p in (perspectives if perspectives is not None else (art.get("perspectives") or []))]
    if len(persps) < 2:
        for p in persps:
            p.pop("focus", None)
            p.pop("omits", None)
        return persps

    corpus_by_outlet = _outlet_source_corpus(art, candidates or [])
    for p in persps:
        out = (p.get("outlet") or "").strip()
        if out and p.get("summary") and p["summary"] not in corpus_by_outlet.get(out, ""):
            corpus_by_outlet[out] = (p["summary"] + " " + corpus_by_outlet.get(out, "")).strip()

    figs_by_outlet = {}
    toks_by_outlet = {}
    for p in persps:
        out = (p.get("outlet") or "").strip()
        txt = corpus_by_outlet.get(out, p.get("summary") or "")
        figs_by_outlet[out] = _extract_concrete_figures(txt)
        toks_by_outlet[out] = _extract_meaningful_tokens(txt)

    for idx, p in enumerate(persps):
        # Nie nadpisuj pól wygenerowanych już wcześniej przez zweryfikowane AI
        if art.get("ai_synthesized") and p.get("focus") and p.get("omits"):
            continue
        out = (p.get("outlet") or "").strip()
        my_figs = figs_by_outlet.get(out, [])
        my_fig_norms = {re.sub(r"\D", "", f) for f in my_figs if re.sub(r"\D", "", f)}
        my_toks = toks_by_outlet.get(out, [])
        my_stems = {st for st, _ in my_toks}

        other_fig_map = {}  # digit_key -> (figure_str, [outlets])
        other_stem_map = {}  # stem -> (display_word, [outlets])
        for o_idx, op in enumerate(persps):
            if o_idx == idx:
                continue
            o_name = (op.get("outlet") or "").strip()
            for f in figs_by_outlet.get(o_name, []):
                dk = re.sub(r"\D", "", f)
                if not dk or dk in my_fig_norms:
                    continue
                entry = other_fig_map.setdefault(dk, [f, []])
                if len(f) > len(entry[0]):
                    entry[0] = f
                if o_name and o_name not in entry[1]:
                    entry[1].append(o_name)
            for st, disp in toks_by_outlet.get(o_name, []):
                if st in my_stems or len(disp) < 5:
                    continue
                entry = other_stem_map.setdefault(st, [disp, []])
                if o_name and o_name not in entry[1]:
                    entry[1].append(o_name)

        # 1. Co ta redakcja eksponuje?
        unique_figs = [
            f for f in my_figs
            if re.sub(r"\D", "", f) not in {
                re.sub(r"\D", "", of)
                for o_idx, op in enumerate(persps) if o_idx != idx
                for of in figs_by_outlet.get((op.get("outlet") or "").strip(), [])
            }
        ]
        other_all_stems = {
            st for o_idx, op in enumerate(persps) if o_idx != idx
            for st, _ in toks_by_outlet.get((op.get("outlet") or "").strip(), [])
        }
        unique_words = [disp for st, disp in my_toks if st not in other_all_stems][:3]

        if unique_figs:
            focus_txt = f"Eksponuje dane ({', '.join(unique_figs[:2])})"
            if unique_words:
                focus_txt += f" oraz wątki: {', '.join(unique_words[:2])}"
            focus_txt += "."
        elif my_figs:
            focus_txt = f"Podkreśla konkretne liczby ({', '.join(my_figs[:2])}) w ujęciu: {(p.get('angle') or 'fakty').lower()}."
        elif unique_words:
            focus_txt = f"Wyróżnia własne wątki i pojęcia: {', '.join(unique_words[:3])}."
        else:
            focus_txt = f"Koncentruje się na głównym fakcie wydarzenia ({(p.get('angle') or 'relacja').lower()})."

        # 2. Co pomija względem pozostałych?
        omitted_figs = sorted(other_fig_map.values(), key=lambda x: (-len(x[1]), -len(x[0])))[:2]
        omitted_words = sorted(other_stem_map.values(), key=lambda x: (-len(x[1]), -len(x[0])))[:3]

        if omitted_figs:
            fig_strs = [item[0] for item in omitted_figs]
            src_names = []
            for _, outs_l in omitted_figs:
                for on in outs_l:
                    if on not in src_names:
                        src_names.append(on)
            omits_txt = f"Pomija wyliczenia ({', '.join(fig_strs)}) przytaczane przez {', '.join(src_names[:2])}."
        elif omitted_words:
            word_strs = [item[0] for item in omitted_words[:3]]
            src_names = []
            for _, outs_l in omitted_words:
                for on in outs_l:
                    if on not in src_names:
                        src_names.append(on)
            omits_txt = f"Pomija kontekst ({', '.join(word_strs)}) rozwijany w {', '.join(src_names[:2])}."
        else:
            omits_txt = "Obejmuje kluczowe fakty i liczby zbieżne z pozostałymi źródłami."

        p["focus"] = focus_txt
        p["omits"] = omits_txt

    return persps


_DISCREPANCY_UNIT_CANON = {
    "zastępów": "zastępów",
    "zastępy": "zastępów",
    "osób": "osób",
    "osoby": "osób",
    "posłów": "posłów",
    "mln zł": "mln zł",
    "mld zł": "mld zł",
    "tys. zł": "tys. zł",
    "mw": "MW",
    "gw": "GW",
    "km": "km",
}


def detect_numeric_discrepancies(art: dict, candidates: list | None = None) -> list:
    """
    Wykrywa rozbieżności liczbowe między redakcjami dla tej samej konkretnej jednostki
    (np. jedna redakcja podaje '10 zastępów', druga '12 zastępów').
    """
    corpus_by_outlet = _outlet_source_corpus(art, candidates)
    if len(corpus_by_outlet) < 2:
        return []

    unit_to_outlet_val = {}
    for outlet, text in corpus_by_outlet.items():
        if not outlet or not text:
            continue
        per_unit = {}
        for fig in _extract_concrete_figures(text):
            m = re.match(r"^(\d+(?:[.,]\d+)?)\s*(.+)$", fig.strip())
            if not m:
                continue
            num_raw, unit_raw = m.group(1), re.sub(r"\s+", " ", m.group(2).strip()).lower()
            canon_unit = _DISCREPANCY_UNIT_CANON.get(unit_raw)
            if not canon_unit:
                continue
            per_unit.setdefault(canon_unit, set()).add((num_raw.replace(",", "."), fig.strip()))
        # Porównuj tylko jednoznaczne wskazania (gdy dana redakcja podaje jedną wartość dla jednostki)
        for u, vals in per_unit.items():
            nums_only = {v[0] for v in vals}
            if len(nums_only) == 1:
                num_norm, disp = next(iter(vals))
                unit_to_outlet_val.setdefault(u, []).append((outlet, num_norm, disp))

    discrepancies = []
    for unit, entries in unit_to_outlet_val.items():
        distinct_nums = {e[1] for e in entries}
        if len(distinct_nums) < 2:
            continue
        # Wybierz po jednym reprezentancie dla każdej odmiennej wartości (maks. 3)
        by_num = {}
        for outlet, num_norm, disp in entries:
            by_num.setdefault(num_norm, (outlet, disp))
        picked = list(by_num.values())[:3]
        vals_out = [{"outlet": o, "value": d} for o, d in picked]
        if len(vals_out) >= 2:
            summary = (
                f"Rozbieżność danych ({unit}): {vals_out[0]['outlet']} podaje {vals_out[0]['value']}, "
                f"natomiast {vals_out[1]['outlet']}: {vals_out[1]['value']}."
            )
            discrepancies.append({
                "unit": unit,
                "values": vals_out,
                "summary": summary,
            })
    return discrepancies[:3]


def count_independent_sources(perspectives: list) -> tuple[int, list]:
    """
    Wykrywa przedruki niemal identycznych tytułów/depesz (Jaccard >= 0.80 na słowach kluczowych)
    i liczy faktyczną liczbę niezależnych redakcji.
    Zwraca (independent_count, syndicate_groups).
    """
    persps = [p for p in (perspectives or []) if (p.get("outlet") or "").strip()]
    if len(persps) <= 1:
        return len(persps), []

    tok_sets = []
    for p in persps:
        raw = _norm_ascii(p.get("summary") or "")
        toks = {w for w in re.findall(r"[a-z0-9]{4,}", raw) if w not in _STOP_FOCUS}
        tok_sets.append(toks)

    parent = list(range(len(persps)))

    def _find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i in range(len(persps)):
        if len(tok_sets[i]) < 4:
            continue
        for j in range(i + 1, len(persps)):
            if len(tok_sets[j]) < 4:
                continue
            inter = len(tok_sets[i] & tok_sets[j])
            union = len(tok_sets[i] | tok_sets[j])
            if union > 0 and (inter / union) >= 0.80:
                ri, rj = _find(i), _find(j)
                if ri != rj:
                    parent[rj] = ri

    groups = {}
    for idx, p in enumerate(persps):
        root = _find(idx)
        groups.setdefault(root, []).append(p["outlet"].strip())

    syndicate_groups = [g for g in groups.values() if len(g) >= 2]
    return len(groups), syndicate_groups


def enrich_seo_title_deterministic(
    base_title: str,
    ranked_group: list,
    sections: list,
    max_len: int = 98,
) -> str:
    """
    Deterministycznie wzbogaca tytuł SEO (0,00 zł) o konkretne fakty liczbowe/daty/kwoty
    obecne w źródłach klastra, jeśli tytuł wiodący ich nie zawiera.
    """
    title = re.sub(r"\s+", " ", (base_title or "").strip())
    if not title:
        return title
    if _extract_concrete_figures(title):
        return title

    # Sprawdź, czy inna redakcja w klastrze ma czysty tytuł z konkretną liczbą na ten sam temat
    base_toks = {st for st, _ in _extract_meaningful_tokens(title)}
    for it in ranked_group[1:]:
        cand_t = re.sub(r"\s+", " ", (it.get("title") or "").strip())
        if not cand_t or len(cand_t) > max_len or _CLICKBAIT_GUARD_RE.search(cand_t):
            continue
        if cand_t.endswith(("?", "...")):
            continue
        cand_figs = _extract_concrete_figures(cand_t)
        cand_toks = {st for st, _ in _extract_meaningful_tokens(cand_t)}
        if cand_figs and len(base_toks & cand_toks) >= 2 and len(cand_t) >= int(len(title) * 0.7):
            return cand_t

    # Jeśli żadna redakcja nie miała liczby w tytule, poszukaj najwyższej wagi faktu liczbowego w 1. sekcji
    if len(title) <= max_len - 16 and sections and not title.endswith(("?", ":", "...")):
        clean_base = title.rstrip(". ")
        first_para = ""
        for p in (sections[0].get("paragraphs") or []):
            first_para += " " + re.sub(r"\[Źródło:\s*[^\]]+\]", "", p)
        figs = _extract_concrete_figures(first_para)
        for fg in figs:
            # Preferuj kwoty, procenty, pełne lata (4 cyfry) lub wyniki z jednostką
            if not any(ch.isalpha() or ch == "%" for ch in fg):
                continue
            digits = re.sub(r"\D", "", fg)
            if fg.lower().endswith("r.") and len(digits) < 4:
                continue
            candidate_title = f"{clean_base} ({fg})"
            if len(candidate_title) <= max_len:
                return candidate_title
    return title


def compress_cluster_for_llm(ranked_group: list, sections: list, max_chars: int = 4200) -> dict:
    """
    Lokalny przed-filtr (Krok 3): odcina ~75% szumu HTML i powtórzeń przed wysłaniem do LLM,
    utrzymując budżet wejścia w okolicach ~1050 tokenów na artykuł.
    """
    outlets_payload = []
    per_outlet_limit = max(280, (max_chars - 600) // max(1, len(ranked_group)))
    for it in ranked_group[:8]:
        raw_desc = re.sub(r"\s+", " ", (it.get("description") or "").strip())
        # Wytnij max 3 zdania w limicie znaków
        sents = re.split(r"(?<=[.!?])\s+", raw_desc)
        snippet_parts = []
        acc = 0
        for s in sents:
            if not s or acc + len(s) > per_outlet_limit:
                break
            snippet_parts.append(s)
            acc += len(s) + 1
            if len(snippet_parts) >= 3:
                break
        snippet = " ".join(snippet_parts) if snippet_parts else raw_desc[:per_outlet_limit]
        outlets_payload.append({
            "outlet": it.get("outlet") or "",
            "title": (it.get("title") or "").strip(),
            "facts": snippet,
            "url": it.get("link") or "",
        })

    sec_summary = []
    for s in (sections or [])[:2]:
        clean_ps = [
            re.sub(r"\s+", " ", p).strip()
            for p in (s.get("paragraphs") or [])[:3]
        ]
        sec_summary.append({"heading": s.get("heading") or "", "paragraphs": clean_ps})

    return {"sources": outlets_payload, "deterministic_sections": sec_summary}


class GeminiCostGuard:
    """Bezpiecznik kosztowy i limit zapytań Free Tier (domyślnie 0,00 zł)."""

    def __init__(
        self,
        budget_path: str | None = None,
        max_calls_per_run: int = DEFAULT_MAX_CALLS_PER_RUN,
        max_daily_calls: int = DEFAULT_MAX_DAILY_CALLS,
    ):
        self.budget_path = budget_path
        self.max_calls_per_run = max_calls_per_run
        self.max_daily_calls = max_daily_calls
        self.calls_this_run = 0
        self.state = self._load()

    def _today_key(self) -> str:
        return datetime.now().strftime("%Y-%m-%d")

    def _load(self) -> dict:
        today = self._today_key()
        default = {"date": today, "daily_calls": 0, "input_chars": 0, "output_chars": 0}
        if not self.budget_path or not os.path.isfile(self.budget_path):
            return default
        try:
            with open(self.budget_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and data.get("date") == today:
                return {
                    "date": today,
                    "daily_calls": int(data.get("daily_calls") or 0),
                    "input_chars": int(data.get("input_chars") or 0),
                    "output_chars": int(data.get("output_chars") or 0),
                }
        except Exception:
            pass
        return default

    def save(self):
        if not self.budget_path:
            return
        try:
            with open(self.budget_path, "w", encoding="utf-8") as f:
                json.dump(self.state, f, ensure_ascii=False, indent=2)
        except OSError:
            pass

    def can_call(self) -> bool:
        if self.calls_this_run >= self.max_calls_per_run:
            return False
        if self.state.get("daily_calls", 0) >= self.max_daily_calls:
            return False
        return True

    def record_call(self, input_chars: int, output_chars: int):
        self.calls_this_run += 1
        self.state["daily_calls"] = int(self.state.get("daily_calls", 0)) + 1
        self.state["input_chars"] = int(self.state.get("input_chars", 0)) + max(0, int(input_chars))
        self.state["output_chars"] = int(self.state.get("output_chars", 0)) + max(0, int(output_chars))
        self.save()


def _validate_zero_trust_llm_output(
    llm_json: dict,
    compressed_payload: dict,
    perspectives: list,
    fallback_title: str,
) -> dict:
    """
    Waliduje JSON zwrócony przez Gemini według zasady Zero-Trust:
    - Odrzuca wszelkie liczby niewystępujące w źródłach (blokada halucynacji liczbowych).
    - Odrzuca nagłówki clickbaitowe, HTML i zmyślone URL-e.
    """
    if not isinstance(llm_json, dict):
        return {}

    source_blob = json.dumps(compressed_payload, ensure_ascii=False)
    allowed_numbers = _extract_raw_numbers(source_blob)
    validated = {}

    def _no_hallucinated_numbers(txt: str) -> bool:
        nums = _extract_raw_numbers(txt)
        return nums.issubset(allowed_numbers)

    def _clean_plain(txt: str) -> str:
        t = re.sub(r"<[^>]+>", "", str(txt or "")).strip()
        return re.sub(r"\s+", " ", t)

    seo_t = _clean_plain(llm_json.get("seo_title") or "")
    if (
        18 <= len(seo_t) <= 105
        and not _CLICKBAIT_GUARD_RE.search(seo_t)
        and _no_hallucinated_numbers(seo_t)
    ):
        validated["seo_title"] = seo_t

    meta_d = _clean_plain(llm_json.get("meta_description") or "")
    if 60 <= len(meta_d) <= 160 and _no_hallucinated_numbers(meta_d):
        validated["meta_description"] = meta_d

    lead_t = _clean_plain(llm_json.get("summary_lead") or "")
    if 40 <= len(lead_t) <= 260 and _no_hallucinated_numbers(lead_t):
        validated["summary_lead"] = lead_t

    llm_persps = llm_json.get("perspectives")
    if isinstance(llm_persps, list) and perspectives:
        by_outlet = {}
        for lp in llm_persps:
            if isinstance(lp, dict) and lp.get("outlet"):
                by_outlet[str(lp["outlet"]).strip()] = lp

        out_persps = []
        updated_any = False
        for orig in perspectives:
            o_name = (orig.get("outlet") or "").strip()
            item = dict(orig)
            lp = by_outlet.get(o_name)
            if lp:
                ang = _clean_plain(lp.get("angle") or "")
                foc = _clean_plain(lp.get("focus") or "")
                omi = _clean_plain(lp.get("omits") or "")
                if 3 <= len(ang) <= 45 and _no_hallucinated_numbers(ang):
                    item["angle"] = ang
                if 15 <= len(foc) <= 220 and _no_hallucinated_numbers(foc):
                    item["focus"] = foc
                    updated_any = True
                if 15 <= len(omi) <= 220 and _no_hallucinated_numbers(omi):
                    item["omits"] = omi
                    updated_any = True
            out_persps.append(item)
        if updated_any:
            validated["perspectives"] = out_persps

    llm_faq = llm_json.get("seo_faq")
    if isinstance(llm_faq, list):
        clean_faq = []
        for item in llm_faq[:3]:
            if not isinstance(item, dict):
                continue
            q = _clean_plain(item.get("q") or "")
            a = _clean_plain(item.get("a") or "")
            if (
                15 <= len(q) <= 130
                and 20 <= len(a) <= 280
                and not _CLICKBAIT_GUARD_RE.search(q)
                and not _CLICKBAIT_GUARD_RE.search(a)
                and _no_hallucinated_numbers(q)
                and _no_hallucinated_numbers(a)
            ):
                if not q.endswith("?"):
                    q = q.rstrip(".! ") + "?"
                if not a.endswith((".", "!", "?")):
                    a += "."
                clean_faq.append({"q": q, "a": a})
        if len(clean_faq) >= 2:
            validated["seo_faq"] = clean_faq

    if not validated.get("seo_title"):
        validated["seo_title"] = fallback_title
    return validated


def call_gemini_zero_trust(
    compressed_payload: dict,
    perspectives: list,
    fallback_title: str,
    api_key: str,
    model: str = DEFAULT_GEMINI_MODEL,
    timeout: int = DEFAULT_TIMEOUT_SEC,
) -> tuple:
    """
    Wywołuje Gemini Free Tier (generateContent JSON) z instrukcją Zero-Trust.
    Zwraca: (validated_dict, input_chars, output_chars).
    """
    system_prompt = (
        "Jesteś bezstronnym redaktorem faktograficznym portalu VERITY działającym w trybie ZERO-TRUST.\n"
        "ZASADY BEZWZGLĘDNE:\n"
        "1. Wolno Ci używać WYŁĄCZNIE faktów, liczb, dat, kwot i nazwisk obecnych w dostarczonym JSON ze źródeł.\n"
        "2. ZAKAZ dodawania jakichkolwiek nowych liczb, wyników głosowań, dat czy domysłów spoza źródeł.\n"
        "3. ZAKAZ clickbaitu, znaków '!!!' i ocen politycznych.\n"
        "4. Przepisz seo_title z myślą o zapytaniach Google (podmiot + kluczowy fakt/liczba ze źródeł, maks. 95 znaków).\n"
        "5. Dla każdej redakcji w perspectives podaj:\n"
        "   - angle (2-4 słowa charakterystyki ujęcia),\n"
        "   - focus (1 krótkie zdanie: co ta redakcja eksponuje),\n"
        "   - omits (1 krótkie zdanie: co pomija względem pozostałych źródeł w tym temacie).\n"
        "6. Dodaj seo_faq: listę 2-3 krótkich pytań i odpowiedzi {q, a} pod Rich Snippets w Google wyłącznie z faktów ze źródeł.\n"
        "Zwróć wyłącznie poprawny obiekt JSON z kluczami: seo_title, summary_lead, meta_description, seo_faq, perspectives "
        "(lista obiektów {outlet, angle, focus, omits})."
    )
    user_payload = json.dumps(compressed_payload, ensure_ascii=False)
    req_body = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_payload}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 1100,
            "responseMimeType": "application/json",
        },
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    raw_bytes = json.dumps(req_body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=raw_bytes,
        method="POST",
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        resp_text = resp.read().decode("utf-8", errors="replace")

    resp_json = json.loads(resp_text)
    candidates = resp_json.get("candidates") or []
    txt_out = ""
    if candidates:
        parts = ((candidates[0].get("content") or {}).get("parts") or [])
        txt_out = "".join(str(p.get("text") or "") for p in parts).strip()

    # Usuń ewentualne otoczki markdown ```json ... ```
    txt_out_clean = re.sub(r"^```(?:json)?\s*|\s*```$", "", txt_out, flags=re.IGNORECASE | re.DOTALL).strip()
    parsed = json.loads(txt_out_clean) if txt_out_clean else {}
    validated = _validate_zero_trust_llm_output(parsed, compressed_payload, perspectives, fallback_title)
    return validated, len(raw_bytes), len(resp_text)


_VOIV_REGION_MAP = {
    "/Polska/Regiony/Dolnoslaskie": "Dolnego Śląska",
    "/Polska/Regiony/Kujawsko-Pomorskie": "woj. kujawsko-pomorskiego",
    "/Polska/Regiony/Lubelskie": "Lubelszczyzny",
    "/Polska/Regiony/Lubuskie": "woj. lubuskiego",
    "/Polska/Regiony/Lodzkie": "woj. łódzkiego",
    "/Polska/Regiony/Malopolskie": "Małopolski",
    "/Polska/Regiony/Mazowieckie": "Mazowsza",
    "/Polska/Regiony/Opolskie": "Opolszczyzny",
    "/Polska/Regiony/Podkarpackie": "Podkarpacia",
    "/Polska/Regiony/Podlaskie": "Podlasia",
    "/Polska/Regiony/Pomorskie": "Pomorza",
    "/Polska/Regiony/Slaskie": "Śląska",
    "/Polska/Regiony/Swietokrzyskie": "woj. świętokrzyskiego",
    "/Polska/Regiony/Warminsko-Mazurskie": "Warmii i Mazur",
    "/Polska/Regiony/Wielkopolskie": "Wielkopolski",
    "/Polska/Regiony/Zachodniopomorskie": "Pomorza Zachodniego",
}


def extract_article_impact(art: dict) -> dict:
    """
    Wyznacza pigułki „Kogo dotyczy / Obszar / Status” (Krok 1) deterministycznie (0,00 zł)
    bez dodawania niepotwierdzonych faktów.
    """
    path = (art.get("path") or "/Polska").strip()
    srcs = art.get("sources") or []
    title = art.get("seo_title") or ""
    lead = art.get("summary_lead") or ""
    secs = art.get("full_sections") or []
    sec_head = " ".join(" ".join(s.get("paragraphs") or [])[:320] for s in secs[:1])
    blob = f"{title} {lead} {sec_head}"
    low = _norm_ascii(blob)

    # 1. Kogo dotyczy
    if re.search(r"\b(?:jdg|przedsiebiorc\w*|skladk\w*\s+zdrowot|ksef|faktur\w*|cit\b|pit\b|vat\b|podatk\w*|zus\b|dzialalnosc\w*\s+gospod)\b", low):
        audience = "Przedsiębiorcy i podatnicy"
    elif re.search(r"\b(?:kierowc\w*|autostrad\w*|ekspresow\w*|drog\w*\s+krajow|mpk|pkp|tramwaj\w*|pociag\w*|lotnisk\w*|paliw\w*|pb95|pb98|diesel|objazd\w*)\b", low):
        audience = "Kierowcy i pasażerowie"
    elif re.search(r"\b(?:cen\w*\s+(?:prad|gaz|ciepl|zywnosc|mieszkan)|rachunk\w*|taryf\w*|inflacj\w*|emeryt\w*|800\s*plus|kredyt\w*|stop\w*\s+procent|nbp|rpp)\b", low):
        audience = "Gospodarstwa domowe i konsumenci"
    elif re.search(r"\b(?:szpital\w*|lekarz\w*|nfz|pacjent\w*|szkol\w*|uczni\w*|student\w*|placa\s+minimaln|wynagrodzen\w*|rynek\s+pracy)\b", low):
        audience = "Pacjenci, pracownicy i usługi"
    elif path in _VOIV_REGION_MAP:
        audience = f"Mieszkańcy {_VOIV_REGION_MAP[path]}"
    elif path == "/Sport":
        audience = "Kibice i środowisko sportowe"
    elif path == "/Swiat":
        audience = "Opinia publiczna i dyplomacja"
    else:
        audience = "Obywatele i instytucje w Polsce"

    # 2. Obszar
    if path == "/Polska/Energetyka" or re.search(r"\b(?:cen\w*\s+(?:prad|gaz|energ)|oze|elektrown\w*|lng|pgnig|taryf\w*|węgiel|wegiel|atom\w*)\b", low):
        scope = "Energia i rachunki"
    elif path == "/Polska/Gospodarka" or re.search(r"\b(?:podatk\w*|budzet\w*|gield\w*|pkb|inflacj\w*|kredyt\w*|rynek|inwestycj\w*)\b", low):
        scope = "Portfel, podatki i rynek"
    elif path == "/Polska/Polityka":
        scope = "Prawo i decyzje publiczne"
    elif path.startswith("/Polska/Regiony"):
        scope = "Sprawy lokalne i samorząd"
    elif path == "/Swiat":
        scope = "Świat i bezpieczeństwo"
    elif path == "/Sport":
        scope = "Sport i rozgrywki"
    else:
        scope = "Wydarzenia krajowe"

    # 3. Status
    if re.search(r"\b(?:wchodzi\s+w\s+zycie|obowiazuje\s+od|podpisal\s+ustaw|rozporzadzeni\w*\s+wejd)\b", low):
        status = "Wchodzi w życie / Obowiązuje"
    elif re.search(r"\b(?:sejm\s+przyjal|sejm\s+uchwalil|uchwalil\s+ustaw|senat\w*|glosowani\w*|nowelizacj\w*|projekt\s+ustaw)\b", low):
        status = "Prace legislacyjne / Głosowanie"
    elif re.search(r"\b(?:zapowiada\w*|planuj\w*|propozycj\w*|konsultacj\w*|projekt\s+rozporz)\b", low):
        status = "Zapowiedź / Etap propozycji"
    elif re.search(r"\b(?:prokurat\w*|zarzut\w*|zatrzyman\w*|areszt\w*|sledztw\w*|wyrok\w*|sad\s+skazal|policja\s+wyjasnia)\b", low):
        status = "Postępowanie / Śledztwo"
    elif re.search(r"\b(?:wypadek|zderzeni\w*|pozar\w*|awari\w*|utrudnieni\w*|objazd\w*|wstrzyman\w*|ewakuacj\w*)\b", low):
        status = "Zdarzenie i utrudnienia"
    elif len(srcs) >= 2:
        src_word = "źródła" if 2 <= len(srcs) <= 4 else "źródeł"
        status = f"Potwierdzone ({len(srcs)} {src_word})"
    else:
        status = "Doniesienie lokalne / branżowe"

    return {"audience": audience, "scope": scope, "status": status}


def _plain_clean_for_faq(text: str) -> str:
    t = re.sub(r"\[Źródło:\s*[^\]]+\]", "", text or "")
    t = re.sub(r"\[\d+:[^\]]+\]", "", t)
    t = re.sub(r"<[^>]+>", "", t)
    return re.sub(r"\s+", " ", t).strip()


def _shorten_faq_sentence(text: str, max_len: int = 240) -> str:
    t = _plain_clean_for_faq(text)
    if len(t) <= max_len:
        return t if t.endswith((".", "!", "?")) else (t.rstrip(",;:-") + ".")
    cut = t[:max_len]
    m_stop = list(re.finditer(r"[.!?](?:\s|$)", cut))
    for m in reversed(m_stop):
        if m.start() >= int(max_len * 0.45):
            return cut[: m.start() + 1].strip()
    trimmed = re.sub(r"\s+\S*$", "", cut).rstrip(",;:-")
    return trimmed + "."


def generate_seo_faq_deterministic(
    art: dict,
    sections: list | None = None,
    impact: dict | None = None,
) -> list:
    """
    Deterministycznie (0,00 zł) generuje 2-3 pary pytań i odpowiedzi (`seo_faq`)
    do schematu Schema.org `FAQPage` (Rich Snippets w Google) na podstawie zweryfikowanej treści.
    """
    title = _plain_clean_for_faq(art.get("seo_title") or "")
    lead = _plain_clean_for_faq(art.get("summary_lead") or "")
    secs = sections if sections is not None else (art.get("full_sections") or [])
    imp = impact or art.get("impact") or extract_article_impact(art)
    srcs = art.get("sources") or []
    pct = art.get("fact_agreement_pct")

    all_paras = [
        _plain_clean_for_faq(p)
        for s in secs
        for p in (s.get("paragraphs") or [])
        if _plain_clean_for_faq(p)
    ]
    all_sents = []
    for para in all_paras:
        for sent in re.split(r"(?<=[.!?])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ0-9„\"—–-])", para):
            s_clean = sent.strip()
            if len(s_clean) >= 30:
                all_sents.append(s_clean)

    if not title or (not lead and not all_sents):
        return []

    short_topic = re.sub(r"[?!.]+$", "", title).strip()
    if len(short_topic) > 74:
        cut_t = short_topic[:74]
        short_topic = re.sub(r"\s+\S*$", "", cut_t).rstrip(" ,;:-–—")

    lead_core = _norm_ascii(lead[:70]) if lead else ""
    non_lead_sents = [
        s for s in all_sents
        if (not lead_core or _norm_ascii(s[:70]) != lead_core)
        and (not lead or (s not in lead and not lead.startswith(s[:50])))
    ]

    # P1: Główne ustalenia spoza leadu (aby nie powtarzać dosłownie .article-lede w .faq-box)
    q1 = title if title.endswith("?") else f"Co wiadomo w sprawie: {short_topic}?"
    if len(q1) > 120:
        q1 = f"Co ustalono w sprawie: {short_topic[:82].rstrip()}?"

    if non_lead_sents:
        a1 = _shorten_faq_sentence(non_lead_sents[0], max_len=245)
        used_sent_idx = 0
    elif srcs:
        a1 = _shorten_faq_sentence(
            f"Opracowanie oparto na doniesieniach {srcs[0]} ({title}).",
            max_len=245,
        )
        used_sent_idx = -1
    else:
        a1 = _shorten_faq_sentence(lead[:95] if len(lead) > 100 else lead, max_len=245)
        used_sent_idx = -1

    faq = [{"q": q1, "a": a1}]

    # P2: Konkretne liczby/terminy z sekcji (inne niż P1) lub kolejny szczegół
    numeric_sent = ""
    detail_sent = ""
    for idx_s, sent in enumerate(non_lead_sents):
        if idx_s == used_sent_idx or sent in a1:
            continue
        if not detail_sent and len(sent) >= 40:
            detail_sent = sent
        if _extract_concrete_figures(sent) and not numeric_sent:
            numeric_sent = sent
            break

    used_impact = False
    if numeric_sent:
        faq.append({
            "q": "Jakie konkretne liczby, terminy lub dane podają źródła?",
            "a": _shorten_faq_sentence(numeric_sent, max_len=245),
        })
    elif detail_sent:
        faq.append({
            "q": "Jakie dodatkowe szczegóły przekazują relacje źródłowe?",
            "a": _shorten_faq_sentence(detail_sent, max_len=245),
        })
    elif imp:
        used_impact = True
        faq.append({
            "q": "Kogo dotyczy i jaki jest status tej sprawy?",
            "a": f"Sprawa dotyczy: {imp['audience']}. Obszar tematyczny: {imp['scope']}. Obecny status: {imp['status']}.",
        })

    # P3: Zasięg/status lub weryfikacja wieloźródłowa
    if not used_impact and imp:
        faq.append({
            "q": "Kogo dotyczy i w jakim obszarze wywołuje skutki?",
            "a": f"Dotyczy grupy: {imp['audience']} (obszar: {imp['scope']}). Status: {imp['status']}.",
        })
    elif len(srcs) >= 2 and pct is not None:
        src_word = "źródeł" if len(srcs) >= 5 else "źródła"
        faq.append({
            "q": "Ile redakcji potwierdziło te informacje?",
            "a": f"Synteza powstała z {len(srcs)} {src_word} ({', '.join(srcs[:4])}) przy zgodności faktów na poziomie {pct}%.",
        })

    return faq[:3]


_DOSSIER_STOP = _STOP_FOCUS | {
    "polski", "polsku", "polacy", "polakow", "rzad", "rzadu", "rzadzie", "sejm", "sejmu", "sejmie",
    "senat", "senatu", "minister", "ministra", "ministerstwo", "prezydent", "prezydenta",
    "premier", "premiera", "poslowie", "posel", "policja", "policji", "straz",
    "prokuratura", "prokuratury", "sad", "sadu", "wyrok", "zarzut", "zarzuty",
    "zatrzymany", "zatrzymano", "wypadek", "wypadku", "zderzenie", "pozar", "mecz",
    "meczu", "reprezentacja", "reprezentacji", "turniej", "turnieju", "liga", "ligi",
    "miasto", "miasta", "miescie", "gmina", "gminy", "powiat", "powiatu", "ulica", "ulicy",
    "droga", "drogi", "szkola", "szkoly", "szpital", "szpitala", "prawie", "ponad",
    "kolejny", "kolejne", "kolejna", "kolejnych", "pierwszy", "pierwsza", "pierwsze", "ostatni",
    "wielki", "wielka", "wielkie", "duzy", "duza", "duze", "wazny", "wazna", "wazne",
    "nowy", "nowa", "nowe", "nowych", "nowego", "nowym",
    "milion", "miliony", "miliard", "miliardy", "tysiac", "tysiecy", "tysiace", "setki", "procent", "proc",
    "kraj", "kraju", "swiat", "swiata", "europa", "europy", "unii", "unia",
    "osoba", "osoby", "osob", "kobieta", "mezczyzna", "dziecko", "dzieci", "ludzie",
    "wlasnie", "dzis", "wczoraj", "jutro", "piatek", "sobota", "niedziela",
    "poniedzialek", "wtorek", "sroda", "czwartek", "styczen", "luty", "marzec",
    "listopad", "listopada", "grudzien", "wynik", "wyniki", "raport", "dane", "danych",
    "ceny", "cena", "cenach", "kwota", "koszt", "koszty", "prace", "pracy", "praca",
    "zmiany", "zmiana", "projekt", "projektu", "ustawa", "ustawy", "decyzja", "decyzji",
    "spotkanie", "rozmowy", "wizyta", "komunikat", "oswiadczenie", "zapowiedzi",
    "coraz", "wzrosla", "wzrost", "spadl", "spadek", "liczba", "liczby", "liczbe",
    "uslyszal", "uslyszala", "uslyszeli", "chetniej", "chetnych", "bardziej", "wiecej", "mniej",
    "blisko", "ujawnil", "ujawnila", "oglosil", "oglosila", "poinformowal", "potwierdzil",
    "wskazal", "ostrzega", "proponuje", "propozycja", "propozycje", "zamian", "sprawdz",
    "korzysta", "korzystaja", "internetu", "aplikacji", "swiadczen", "atak", "atakiem",
    "zabral", "glos", "tragiczn", "tragicz", "zyje", "zyja", "podjal", "wszystk", "wszystko",
    "zabloko", "zablokow", "zderzyl", "dwie", "piec", "jeden", "zdecydo", "kierunk", "dalej", "przy", "stole",
    "inne", "innych", "samocho", "samochod", "autostr", "autostrad", "piesz", "pieszy", "pieszeg", "potraci",
}

_DOSSIER_CITIES = (
    "warszaw", "krakow", "gdansk", "poznan", "wroclaw", "lodz", "katowic", "szczecin",
    "lublin", "bydgoszcz", "bialystok", "rzeszow", "olsztyn", "kielc", "opole", "torun",
    "gdyni", "sopot", "kijow", "moskw", "berlin", "paryz", "waszyngton", "londyn", "bruksel",
)

_DOSSIER_PL_SUFS = (
    "owskiego", "owskiemu", "owskich", "owskimi", "owskim", "owskiej", "owska", "owski",
    "skiego", "skiemu", "skich", "skimi", "skim", "skiej", "ska", "ski",
    "aniami", "aniach", "aniom", "aniem", "ania", "aniu", "anie",
    "eniami", "eniach", "eniom", "eniem", "enia", "eniu", "enie",
    "iami", "iach", "iemu", "iego", "imi", "ich", "iej", "ami", "ach", "owi", "omu", "emu", "ego", "om", "ow",
    "ie", "iu", "em", "a", "u", "y", "i", "e", "o",
)


def _dossier_stem(word: str) -> str:
    w = _norm_ascii(word).strip("-")
    if len(w) <= 4:
        return w
    for suf in _DOSSIER_PL_SUFS:
        if w.endswith(suf) and len(w) - len(suf) >= 4:
            w = w[: -len(suf)]
            break
    if w in ("krakowi", "krakow"):
        return "krakow"
    return w


def _dossier_sig(art: dict) -> dict:
    title = art.get("seo_title") or ""
    lead = art.get("summary_lead") or ""
    blob = f"{title} {lead[:140]}"
    words = re.findall(r"[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9-]{4,}", title)
    lead_words = re.findall(r"[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9-]{4,}", lead[:140])

    title_stems = set()
    proper_forms = {}  # stem -> display form
    proper_stems = set()
    all_stems = set()

    for idx_w, w in enumerate(words):
        nw = _norm_ascii(w).strip("-")
        if len(nw) < 4 or nw.isdigit() or nw in _DOSSIER_STOP:
            continue
        stem = _dossier_stem(nw)
        if len(stem) < 4 or stem in _DOSSIER_STOP or nw in _DOSSIER_STOP:
            continue
        title_stems.add(stem)
        all_stems.add(stem)
        is_cap = len(w) >= 2 and w[0].isupper() and (idx_w > 0 or w.isupper())
        if is_cap:
            proper_stems.add(stem)
        if is_cap and stem not in proper_forms:
            proper_forms[stem] = w.strip(".,:;()\"„”")
        elif stem not in proper_forms:
            proper_forms[stem] = w.strip(".,:;()\"„”").lower()

    for w in lead_words:
        nw = _norm_ascii(w).strip("-")
        if len(nw) < 4 or nw.isdigit() or nw in _DOSSIER_STOP:
            continue
        stem = _dossier_stem(nw)
        if len(stem) >= 4 and stem not in _DOSSIER_STOP:
            all_stems.add(stem)

    cities = set()
    for c_pref in _DOSSIER_CITIES:
        if re.search(rf"\b{c_pref}\w*", _norm_ascii(title)):
            cities.add(c_pref)

    low_all = _norm_ascii(blob)
    roads = set(re.findall(r"\b(?:[sa]\d{1,2}|dk\d{1,3})\b", low_all))
    sport_disc = ""
    if (art.get("path") or "") == "/Sport":
        if any(k in low_all for k in ("tenis", "wta", "atp", "swiatek", "sabalenk", "hurkacz")):
            sport_disc = "tenis"
        elif any(k in low_all for k in ("siatkow", "plusliga", "tauron")):
            sport_disc = "siatkowka"
        elif any(k in low_all for k in ("pilk", "uefa", "ekstraklas", "lewandowsk", "bramk")):
            sport_disc = "pilka"

    return {
        "path": (art.get("path") or "/Polska").strip(),
        "title_stems": title_stems,
        "all_stems": all_stems,
        "proper_stems": proper_stems,
        "forms": proper_forms,
        "cities": cities,
        "roads": roads,
        "sport_disc": sport_disc,
    }


def _dossier_compatible(sig_a: dict, sig_b: dict) -> bool:
    pa, pb = sig_a["path"], sig_b["path"]
    if (pa == "/Sport") != (pb == "/Sport"):
        return False
    if pa == "/Sport" and sig_a["sport_disc"] and sig_b["sport_disc"] and sig_a["sport_disc"] != sig_b["sport_disc"]:
        return False
    if (pa == "/Swiat" and pb.startswith("/Polska/Regiony/")) or (pb == "/Swiat" and pa.startswith("/Polska/Regiony/")):
        return False
    if pa.startswith("/Polska/Regiony/") and pb.startswith("/Polska/Regiony/") and pa != pb:
        return False
    if sig_a["cities"] and sig_b["cities"] and not (sig_a["cities"] & sig_b["cities"]):
        return False
    if sig_a["roads"] and sig_b["roads"] and not (sig_a["roads"] & sig_b["roads"]):
        return False

    shared_title = sig_a["title_stems"] & sig_b["title_stems"]
    if len(shared_title) < 2:
        return False
    shared_all = sig_a["all_stems"] & sig_b["all_stems"]
    shared_proper = shared_title & (sig_a["proper_stems"] | sig_b["proper_stems"])
    if len(shared_title) >= 3 and len(shared_proper) >= 1:
        return True
    if len(shared_title) == 2 and len(shared_all) >= 3 and len(shared_proper) >= 1:
        return True
    return False


def assign_dossier_timelines(articles: list) -> int:
    """
    Grupuje powtarzające się i długofalowe tematy w „Akta Sprawy” (Krok 1):
    przypisuje `dossier_title`, `dossier_count`, `dossier_index` oraz `dossier_items`
    chronologicznie (do 5 kluczowych etapów) bez fałszywego sklejania różnych miast/dyscyplin.
    """
    items = list(articles or [])
    for a in items:
        for k in ("dossier_title", "dossier_count", "dossier_index", "dossier_items"):
            a.pop(k, None)

    if len(items) < 2:
        return 0

    sigs = [_dossier_sig(a) for a in items]
    n = len(items)
    adj = [[] for _ in range(n)]
    for i in range(n):
        if len(sigs[i]["title_stems"]) < 2:
            continue
        for j in range(i + 1, n):
            if len(sigs[j]["title_stems"]) < 2:
                continue
            if _dossier_compatible(sigs[i], sigs[j]):
                adj[i].append(j)
                adj[j].append(i)

    visited = [False] * n
    dossier_clusters = 0

    for i in range(n):
        if visited[i] or not adj[i]:
            continue
        # Zbierz spójną składową z ograniczeniem rozmiaru, bez dryfu łańcuchowego
        queue = [i]
        visited[i] = True
        comp = []
        seed_stems = sigs[i]["title_stems"]
        while queue:
            cur = queue.pop(0)
            comp.append(cur)
            if len(comp) >= 10:
                continue
            for nxt in adj[cur]:
                if not visited[nxt] and len(sigs[nxt]["title_stems"] & seed_stems) >= 2:
                    visited[nxt] = True
                    queue.append(nxt)

        if len(comp) < 2:
            continue

        comp_sorted = sorted(
            comp,
            key=lambda idx: (items[idx].get("published_iso") or "", int(items[idx].get("id") or 0)),
        )
        # Ustal tytuł akt na podstawie najczęstszych rdzeni w tytułach klastra
        stem_counts = {}
        form_best = {}
        for idx in comp_sorted:
            for st in sigs[idx]["title_stems"]:
                stem_counts[st] = stem_counts.get(st, 0) + 1
                cand_f = sigs[idx]["forms"].get(st, "")
                if cand_f and (st not in form_best or (cand_f[0].isupper() and not form_best[st][0].isupper())):
                    form_best[st] = cand_f

        top_stems = sorted(
            [st for st, cnt in stem_counts.items() if cnt >= 2],
            key=lambda st: (-stem_counts[st], -(1 if form_best.get(st, "")[:1].isupper() else 0), -len(st)),
        )[:3]
        if not top_stems:
            continue
        title_parts = []
        for idx_t, st in enumerate(top_stems):
            lbl = form_best.get(st, st)
            if idx_t == 0 and lbl:
                lbl = lbl[0].upper() + lbl[1:]
            title_parts.append(lbl)
        dossier_title = " · ".join(title_parts)[:48]

        if len(comp_sorted) > 5:
            timeline_idxs = [comp_sorted[0]] + comp_sorted[-4:]
        else:
            timeline_idxs = comp_sorted

        timeline_items = [
            {
                "id": items[idx].get("id"),
                "seo_url": items[idx].get("seo_url") or "",
                "seo_title": items[idx].get("seo_title") or "",
                "display_date": items[idx].get("display_date") or "",
                "published_iso": items[idx].get("published_iso") or "",
            }
            for idx in timeline_idxs
        ]
        total_cnt = len(comp_sorted)
        for pos, idx in enumerate(comp_sorted, start=1):
            art_obj = items[idx]
            art_obj["dossier_title"] = dossier_title
            art_obj["dossier_count"] = total_cnt
            art_obj["dossier_index"] = pos
            art_obj["dossier_items"] = timeline_items
        dossier_clusters += 1

    return dossier_clusters


def enhance_article_narrative_and_seo(
    art: dict,
    ranked_group: list,
    cost_guard: GeminiCostGuard | None = None,
    use_gemini: bool | None = None,
    api_key: str | None = None,
    model: str | None = None,
) -> dict:
    """
    Główny punkt wejścia (Krok 3 + Krok 4 + C):
    1. Zawsze wylicza deterministyczne porównanie redakcji (focus / omits), wzbogacony seo_title,
       pigułki `impact` oraz pytania `seo_faq` (0,00 zł).
    2. Jeśli dostępny jest GEMINI_API_KEY, tryb AI nie jest wyłączony i bezpiecznik kosztowy pozwala,
       wzbogaca artykuł o syntezę Gemini Free Tier z walidacją Zero-Trust.
    """
    impact = extract_article_impact(art)
    art["impact"] = impact

    if len(art.get("sources") or []) < 2:
        if not art.get("seo_faq"):
            art["seo_faq"] = generate_seo_faq_deterministic(art, art.get("full_sections") or [], impact=impact)
        return art

    base_title = art.get("seo_title") or ""
    enriched_title = enrich_seo_title_deterministic(base_title, ranked_group, art.get("full_sections") or [])
    art["seo_title"] = enriched_title
    art["perspectives"] = compute_comparative_perspectives(
        art, candidates=ranked_group, perspectives=art.get("perspectives") or []
    )
    art["discrepancies"] = detect_numeric_discrepancies(art, candidates=ranked_group)
    indep_cnt, syn_groups = count_independent_sources(art.get("perspectives") or [])
    art["independent_sources_count"] = indep_cnt
    art["syndicate_groups"] = syn_groups
    if not (art.get("ai_synthesized") and art.get("seo_faq")):
        art["seo_faq"] = generate_seo_faq_deterministic(art, art.get("full_sections") or [], impact=impact)

    key = api_key if api_key is not None else os.environ.get("GEMINI_API_KEY", "").strip()
    env_flag = os.environ.get("VERITY_USE_GEMINI", "").strip().lower()
    if use_gemini is None:
        use_gemini = bool(key) and env_flag not in ("0", "false", "no")
    if not use_gemini or not key:
        return art

    if art.get("ai_synthesized") and int(art.get("ai_source_count") or 0) == len(art.get("sources") or []):
        return art

    if cost_guard is not None and not cost_guard.can_call():
        return art

    chosen_model = (model or os.environ.get("VERITY_GEMINI_MODEL") or DEFAULT_GEMINI_MODEL).strip()
    compressed = compress_cluster_for_llm(ranked_group, art.get("full_sections") or [])
    try:
        validated, in_c, out_c = call_gemini_zero_trust(
            compressed_payload=compressed,
            perspectives=art.get("perspectives") or [],
            fallback_title=enriched_title,
            api_key=key,
            model=chosen_model,
        )
        if cost_guard is not None:
            cost_guard.record_call(in_c, out_c)
        if validated:
            if validated.get("seo_title"):
                art["seo_title"] = validated["seo_title"]
            if validated.get("summary_lead"):
                art["summary_lead"] = validated["summary_lead"]
            if validated.get("meta_description"):
                art["meta_description"] = validated["meta_description"]
            if validated.get("perspectives"):
                art["perspectives"] = validated["perspectives"]
            if validated.get("seo_faq"):
                art["seo_faq"] = validated["seo_faq"]
            art["ai_synthesized"] = True
            art["ai_model"] = chosen_model
            art["ai_source_count"] = len(art.get("sources") or [])
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, KeyError, TimeoutError, OSError):
        # Bezpieczny fallback do warstwy deterministycznej (0,00 zł) przy błędzie sieci / limitu Free Tier
        pass

    return art
