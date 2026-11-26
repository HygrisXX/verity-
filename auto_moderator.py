#!/usr/bin/env python3
"""
VERITY — Silnik częściowo automatycznej moderacji treści społeczności (czat, komentarze, wpisy).

Trzy poziomy decyzji (zgodne z zasadą: zero cenzury poglądów i ostrej polemiki):
1. ALLOW        — normalna dyskusja, krytyka, sarkazm, a nawet ostre riposty bez ciężkich wulgaryzmów
                  (np. „czy jesteś chory psychicznie?”, „bredzisz”, sytuacyjne przekleństwo bez ataku).
2. FLAG_REVIEW  — treści graniczne (np. nagromadzenie ≥3 ciężkich wulgaryzmów lub wulgaryzm wobec
                  osoby trzeciej): treść ukazuje się normalnie, ale AutoMod zakłada zgłoszenie
                  PENDING w kolejce do ręcznej decyzji moderatora (brak fałszywych banów).
3. AUTO_BLOCK   — ewidentne, ciężkie naruszenia blokowane natychmiast przed publikacją + punkty karne
                  i jawny wpis (z cenzurą wulgaryzmu) w Publicznym Rejestrze /moderacja/:
                  * §2.3 (+10 pkt): groźby przemocy/śmierci, nawoływanie do samookaleczenia, doxxing.
                  * §2.1 (+2 pkt): ciężkie wulgarne obelgi wobec rodziny („twoja matka jest kurwą”)
                    oraz bezpośrednie ciężkie wulgarne wyzwiska personalne („jebać cię”, „pojebać cię”,
                    „ty kurwo”, „chuj ci w dupę”, „wypierdalaj”, „skurwysynu”, „zjebie”, „cwelu”).
"""

from __future__ import annotations

import dataclasses
import re


_DIACRITIC_TRANS = str.maketrans(
    "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ",
    "acelnoszzacelnoszz",
)

_LEET_TRANS = str.maketrans("01345@$!", "oieasasi")

# Naprawa maskowania znakami (* . _ -) wewnątrz wulgaryzmu (np. k*rwa, j*bać, p*jeb, k.u.r.w.a)
_OBFUSCATED_STEMS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bk[*._-]*u?[*._-]+r[*._-]*w", re.IGNORECASE), "kurw"),
    (re.compile(r"\bs[*._-]*k[*._-]*u?[*._-]+r[*._-]*w", re.IGNORECASE), "skurw"),
    (re.compile(r"\bj[*._-]+e?[*._-]*b", re.IGNORECASE), "jeb"),
    (re.compile(r"\bp[*._-]*o[*._-]*j[*._-]+e?[*._-]*b", re.IGNORECASE), "pojeb"),
    (re.compile(r"\bz[*._-]*j[*._-]+e?[*._-]*b", re.IGNORECASE), "zjeb"),
    (re.compile(r"\bc[*._-]*h[*._-]+u?[*._-]*j", re.IGNORECASE), "chuj"),
    (re.compile(r"\bp[*._-]*i[*._-]+e?[*._-]*r[*._-]*d[*._-]*o[*._-]*l", re.IGNORECASE), "pierdol"),
    (re.compile(r"\bp[*._-]+i[*._-]*z[*._-]*d", re.IGNORECASE), "pizd"),
    (re.compile(r"\bd[*._-]*z[*._-]+i[*._-]*w[*._-]*k", re.IGNORECASE), "dziwk"),
    (re.compile(r"\bs[*._-]*z[*._-]*m[*._-]+a[*._-]*t", re.IGNORECASE), "szmat"),
    (re.compile(r"\bc[*._-]*w[*._-]+e[*._-]*l", re.IGNORECASE), "cwel"),
]

# Rozstrzelony zapis typu "k u r w a" albo "j e b a c" (>=4 pojedyncze litery oddzielone spacją)
_SPACED_LETTERS_RE = re.compile(r"\b([a-z])(?:\s+([a-z])){3,}\b")


def normalize_for_moderation(text: str) -> str:
    """Normalizuje tekst pod wykrywanie ciężkich nadużyć (składanie polskich znaków, leetspeak, k*rwa, k.u.r.w.a)."""
    if not text:
        return ""
    s = text.translate(_DIACRITIC_TRANS).lower()
    # Najpierw napraw znane maskowania z gwiazdką/kropkami/myślnikami wewnątrz wyrazów
    for rx, repl in _OBFUSCATED_STEMS:
        s = rx.sub(lambda m, r=repl: r if re.search(r"[*._-]", m.group(0)) else m.group(0), s)

    # Dekoduj leetspeak wyłącznie w tokenach zawierających przynajmniej jedną literę (nie psuj czystych liczb/PESEL!)
    def _decode_token(m: re.Match[str]) -> str:
        tok = m.group(0)
        if re.search(r"[a-z]", tok) and re.search(r"[01345@$!]", tok):
            return tok.translate(_LEET_TRANS)
        return tok

    s = re.sub(r"[a-z0-9@$!]+", _decode_token, s)
    # Zwijaj rozciągnięte powtórzenia znaków ("kurwwwaaa" -> "kurwa")
    s = re.sub(r"([a-z])\1{2,}", r"\1", s)
    # Zwijaj rozstrzelone pojedyncze litery ("k u r w a" -> "kurwa")
    s = _SPACED_LETTERS_RE.sub(lambda m: re.sub(r"\s+", "", m.group(0)), s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


# ==================== WZORCE §2.3: GROŹBY KARALNE I DOXXING (+10 PKT, AUTO_BLOCK) ====================
_THREAT_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(
            r"\b(?:(?:zabij[ea]|zajebi[ea]|zakatrupi[ea]|rozjebi[ea])\s+(?:cie|ciebie|was|go|ja|ich|twoj\w*)|"
            r"(?:cie|ciebie|was)\s+(?:zabij[ea]|zajebi[ea]|zakatrupi[ea]|rozjebi[ea])|"
            r"polami[ea]\s+ci\s+(?:nogi|kosci|rece|kark)|"
            r"podpal[ea]\s+(?:ci|twoj\w*)\s+(?:dom|mieszkanie|auto)|poderzn[ea]\s+ci\s+gardlo)\b",
            re.IGNORECASE,
        ),
        "Groźba przemocy fizycznej lub pozbawienia życia",
    ),
    (
        re.compile(
            r"\b(?:znajd[ea]\s+cie|wiem\s+gdzie\s+mieszkasz).{0,30}\b(?:zabij|zajeb|wpierdol|polami|dojad|rozjeb|pozar|spal)\w*\b",
            re.IGNORECASE,
        ),
        "Groźba karalna wobec uczestnika dyskusji",
    ),
    (
        re.compile(
            r"\b(?:powies\s+sie|zabij\s+sie|strzel\s+sobie\s+w\s+leb|skocz\s+z\s+(?:okna|mostu|balkonu)|zdechnij(?:\s+(?:kurwo|smieciu|psie|jeban\w*))?)\b",
            re.IGNORECASE,
        ),
        "Życzenie śmierci lub nawoływanie do samookaleczenia",
    ),
    (
        re.compile(r"\bpesel\b.{0,12}\b\d{11}\b", re.IGNORECASE),
        "Publikacja prywatnego numeru PESEL (doxxing)",
    ),
    (
        re.compile(
            r"\b(?:mieszka\s+(?:na|przy)\s+ul\.?|jego\s+adres\s+to|jej\s+adres\s+to).{0,45}\b(?:tel\.?|telefon|nr)\b.{0,15}\b(?:\+?48)?[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3}\b",
            re.IGNORECASE,
        ),
        "Publikacja prywatnego adresu i numeru telefonu (doxxing)",
    ),
]


# ==================== WZORCE §2.1: CIĘŻKIE WULGARNE OBELGI PERSONALNE (+2 PKT, AUTO_BLOCK) ====================
_FAMILY_NOUN = r"(?:matk\w*|mam[aeyiu]\w*|star[aeyo]\w*|ojc\w*|tat[aeyiu]\w*|siostr\w*|brat\w*|zon\w*|dziec\w*|rodzin\w*|babci\w*)"
_SEVERE_SLUR = (
    r"(?:kurw\w*|kurew\w*|dziwk\w*|szmat\w*|suk[aouie]\b|ladacznic\w*|skurwy\w*|skurwiel\w*|"
    r"jeban\w*|jebac\w*|pojeb\w*|zjeb\w*|pierdolon\w*|pierdolc\w*|pizd\w*|chuj\w*|cwel\w*|kutas\w*)"
)

_SEVERE_PERSONAL_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # 1. Ciężkie wulgarne obelgi wobec rodziny (np. "twoja matka jest kurwą", "twoja stara to dziwka", "jebać twoją matkę")
    (
        re.compile(
            rf"\b(?:twoj\w*|twej|ci|wasz\w*)\s+{_FAMILY_NOUN}\b.{{0,24}}\b{_SEVERE_SLUR}",
            re.IGNORECASE,
        ),
        "Ciężka wulgarna obelga wobec rodziny rozmówcy",
    ),
    (
        re.compile(
            rf"\b(?:jebac|pojebac|ruchac|pierdolic|wyruchac)\s+(?:twoj\w*|twej|ci|wasz\w*)\s+{_FAMILY_NOUN}\b",
            re.IGNORECASE,
        ),
        "Ciężka wulgarna obelga wobec rodziny rozmówcy",
    ),
    # 2. Bezpośrednie wulgarne ataki i rozkaźniki w stronę osoby ("jebać cię", "pojebać ty", "chuj ci w dupę", "wypierdalaj")
    (
        re.compile(
            r"\b(?:jebac|pojebac|wyjebac|pierdolic)\s+(?:cie|ciebie|ty|was|go|ja|ich)\b",
            re.IGNORECASE,
        ),
        "Bezpośredni wulgarny atak personalny",
    ),
    (
        re.compile(
            r"\b(?:pojebal\w*|popierdolil\w*|zjebal\w*)\s+(?:cie|ciebie|was|ty)\b",
            re.IGNORECASE,
        ),
        "Bezpośredni wulgarny atak personalny",
    ),
    (
        re.compile(
            r"\b(?:wypierdalaj|spierdalaj|odpierdol\s+sie|chuj\s+ci\s+w\s+(?:dupe|ryj|morde|oko|leb)|"
            r"ssij\s+(?:mi|chuja|pale|palke)|zamknij\s+(?:ryj|morde|pizde)|stul\s+pizde|wal\s+sie)\b",
            re.IGNORECASE,
        ),
        "Bezpośredni wulgarny atak personalny",
    ),
    # 3. Bezpośrednie wyzwiska w 2. osobie ("ty kurwo", "jesteś pojebany", "z ciebie zwykły cwel")
    (
        re.compile(
            rf"\b(?:ty|jestes|z\s+ciebie|ale\s+z\s+ciebie)\s+(?:[a-z]+\s+){{0,2}}{_SEVERE_SLUR}",
            re.IGNORECASE,
        ),
        "Bezpośrednie ciężkie wulgarne wyzwisko personalne",
    ),
    (
        re.compile(
            rf"\b{_SEVERE_SLUR}\s+(?:z\s+ciebie|jestes|ty)\b",
            re.IGNORECASE,
        ),
        "Bezpośrednie ciężkie wulgarne wyzwisko personalne",
    ),
    # 4. Jednoznaczne ciężkie wołacze skierowane wprost do rozmówcy ("kurwo", "skurwysynu", "zjebie", "pojebie", "cwelu")
    (
        re.compile(
            r"\b(?:kurwo|skurwysynu|skurwielu|chuju|pizdo|cwelu|zjebie|pojebie|kutasie|dziwko|szmato|pierdolcu|jebancu|ty\s+smieciu|podludziu)\b",
            re.IGNORECASE,
        ),
        "Bezpośrednie ciężkie wulgarne wyzwisko personalne",
    ),
]


# ==================== WZORCE GRANICZNE (FLAG_REVIEW — KOLEJKA CZŁOWIEKA) ====================
_STRONG_PROFANITY_TOKEN_RE = re.compile(
    r"\b(?:kurw\w*|skurwy\w*|skurwiel\w*|jebac\w*|jeban\w*|pojeb\w*|zjeb\w*|pierdol\w*|chuj\w*|pizd\w*|cwel\w*|dziwk\w*|szmat\w*)\b",
    re.IGNORECASE,
)

_THIRD_PARTY_SLUR_RE = re.compile(
    r"\b(?:to|sa|jest)\s+(?:zwykl\w*\s+|jeban\w*\s+|pierdolon\w*\s+)?(?:kurw\w*|skurwy\w*|skurwiel\w*|chuj\w*|cwel\w*|zjeb\w*|pojeb\w*|dziwk\w*|szmat\w*)\b",
    re.IGNORECASE,
)


# Cenzura wulgaryzmów wyłącznie w publicznym logu /moderacja/
_REDACT_RE = re.compile(
    r"\b(kurw\w*|kurew\w*|skurwy\w*|skurwiel\w*|jeba\w*|pojeb\w*|zjeb\w*|wyjeb\w*|pierdol\w*|wypierdal\w*|spierdal\w*|odpierdol\w*|chuj\w*|pizd\w*|cwel\w*|dziwk\w*|szmat\w*|kutas\w*)\b",
    re.IGNORECASE,
)


def redact_profanity_for_log(text: str) -> str:
    """Maskuje rdzenie wulgaryzmów gwiazdkami (np. 'kurwą' -> 'k***ą'), aby publiczny rejestr /moderacja/ pozostał czytelny."""
    def _mask(m: re.Match[str]) -> str:
        w = m.group(0)
        if len(w) <= 3:
            return w[0] + "*" * (len(w) - 1)
        return w[0] + "*" * max(3, len(w) - 2) + w[-1]

    return _REDACT_RE.sub(_mask, text or "")


@dataclasses.dataclass(frozen=True)
class ModerationVerdict:
    action: str          # "ALLOW" | "FLAG_REVIEW" | "AUTO_BLOCK"
    tariff_code: str     # "" | "§2.1" | "§2.2" | "§2.3"
    reason: str
    redacted_excerpt: str

    def to_dict(self) -> dict:
        return {
            "action": self.action,
            "tariff_code": self.tariff_code,
            "reason": self.reason,
            "redacted_excerpt": self.redacted_excerpt,
        }


def evaluate_content(text: str) -> ModerationVerdict:
    """
    Ocenia tekst użytkownika w modelu częściowo automatycznym:
    - ALLOW: dyskusja, krytyka, ostre riposty (np. 'czy jesteś chory psychicznie?'), pojedyncze przekleństwo bez ataku.
    - FLAG_REVIEW: treści graniczne (np. ≥3 wulgaryzmy lub wulgaryzm wobec osoby trzeciej) -> trafia do kolejki człowieka.
    - AUTO_BLOCK: ciężkie wulgarne ataki personalne / na rodzinę (§2.1) lub groźby/doxxing (§2.3).
    """
    raw = (text or "").strip()
    excerpt = redact_profanity_for_log(raw[:160].rstrip() + ("…" if len(raw) > 160 else ""))
    norm = normalize_for_moderation(raw)
    if not norm:
        return ModerationVerdict("ALLOW", "", "", excerpt)

    # 1. Groźby karalne / doxxing (§2.3 -> AUTO_BLOCK)
    for rx, reason in _THREAT_PATTERNS:
        if rx.search(norm):
            return ModerationVerdict("AUTO_BLOCK", "§2.3", reason, excerpt)

    # 2. Ciężkie wulgarne obelgi personalne i wobec rodziny (§2.1 -> AUTO_BLOCK)
    for rx, reason in _SEVERE_PERSONAL_PATTERNS:
        if rx.search(norm):
            return ModerationVerdict("AUTO_BLOCK", "§2.1", reason, excerpt)

    # 3. Przypadki graniczne -> FLAG_REVIEW (publikacja + automatyczne zgłoszenie do ręcznej weryfikacji)
    prof_hits = _STRONG_PROFANITY_TOKEN_RE.findall(norm)
    if len(prof_hits) >= 3:
        return ModerationVerdict(
            "FLAG_REVIEW",
            "§2.2",
            f"Auto-flaga: nagromadzenie ciężkich wulgaryzmów ({len(prof_hits)}) — do ręcznej oceny moderatora",
            excerpt,
        )
    if _THIRD_PARTY_SLUR_RE.search(norm):
        return ModerationVerdict(
            "FLAG_REVIEW",
            "§2.1",
            "Auto-flaga: ciężki wulgaryzm pod adresem osoby/podmiotu — do ręcznej oceny moderatora",
            excerpt,
        )

    return ModerationVerdict("ALLOW", "", "", excerpt)
