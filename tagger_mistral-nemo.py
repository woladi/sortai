#!/usr/bin/env python3
"""Tagger v6: ocrmac (Apple Vision) + PyMuPDF -> regex -> Mistral-Nemo (text only). No LLaVA. No pdf2image."""
import sys, subprocess

REQUIRED = {
    "requests":  "requests",
    "xattr":     "xattr",
    "ocrmac":    "ocrmac",
    "fitz":      "PyMuPDF",
}

def ensure_deps():
    missing = []
    for mod, pkg in REQUIRED.items():
        try: __import__(mod)
        except ImportError: missing.append(pkg)
    if missing:
        print(f"📦 Instaluję: {missing}")
        subprocess.check_call([sys.executable, "-m", "pip", "install", *missing])
        print("✅ Zainstalowano. Uruchom skrypt ponownie.")
        sys.exit(0)
ensure_deps()

import os, re, json, plistlib
from pathlib import Path
import xattr, requests

SOURCE_DIR        = os.path.expanduser("~/Desktop")
OLLAMA_URL        = "http://localhost:11434/api/generate"
TEXT_MODEL        = "mistral-nemo"
OCR_MAX_CHARS     = 4000
LLM_OCR_MAX_CHARS = 1500

EXCLUDED_FOLDERS = {"AI_Sorter", "Dupa"}
SKIP_EXT  = {".ds_store", ".sig", ".localized", ".tmp", ".lock", ".pyc"}
OCR_EXT   = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
VIDEO_EXT = {".mov", ".mp4", ".m4v"}

ALLOWED_TAGS = {
    "#BNPParibas","#PKOBP","#Revolut","#WS48","#UODO","#UOKiK","#BIK","#KaczmarskiInkasso","#CreditAngel",
    "#BANKI","#KredytHipoteczny","#KredytGotowkowy","#KartaKredytowa","#LimitROR","#SKD",
    "#RODO","#Windykacja","#WakacjeKredytowe","#Nieruchomosc",
    "#Kariera","#CV","#Zdrowie","#Spadek","#UrzadPracy",
    "#Branding","#YouthRebuild","#Gecko","#Weles",
    "#Umowa","#Faktura","#FakturaProforma","#Reklamacja","#Skarga","#Oswiadczenie",
    "#Wniosek","#Wyciag","#Harmonogram","#Decyzja","#RaportBIK","#Pismo","#Protokol",
    "#Ugoda","#Draft","#Transkrypcja","#Regulamin","#Brief",
    "#Wyslane","#Odebrane","#Dowod","#Zalacznik","#Duplikat",
    "#Skan","#Screenshot","#Nagranie","#Email","#Foto","#Grafika","#AI_Sorted",
}

TAG_ALIASES = {
    "#Banki":"#BANKI","#banki":"#BANKI",
    "#Hipoteczny":"#KredytHipoteczny",
    "#Gotowkowy":"#KredytGotowkowy","#Gotówkowy":"#KredytGotowkowy","#KredytGotówkowy":"#KredytGotowkowy",
    "#Karta":"#KartaKredytowa",
    "#Wspólnota":"#Nieruchomosc","#Wspolnota":"#Nieruchomosc","#Mieszkanie":"#Nieruchomosc",
    "#RODOComplaint":"#RODO","#DebtCollection":"#Windykacja",
    "#Screen":"#Screenshot","#Photo":"#Foto","#Graphic":"#Grafika","#Video":"#Nagranie",
}

STRICT_TAGS = {
    "#BNPParibas","#PKOBP","#Revolut","#KaczmarskiInkasso","#CreditAngel",
    "#UODO","#UOKiK","#BIK",
    "#KartaKredytowa","#KredytHipoteczny","#KredytGotowkowy",
    "#LimitROR","#SKD","#WakacjeKredytowe","#Windykacja","#RODO",
}

STRICT_EVIDENCE_MAP = {
    "#BNPParibas":        ["bnp paribas","bnpparibas"],
    "#PKOBP":             ["pko bp","pkobp","powszechna kasa"],
    "#Revolut":           ["revolut"],
    "#KaczmarskiInkasso": ["kaczmarski","inkasso"],
    "#CreditAngel":       ["creditangel","credit angel"],
    "#UODO":              ["uodo","urząd ochrony danych"],
    "#UOKiK":             ["uokik","urząd ochrony konkurencji"],
    "#BIK":               ["biuro informacji kredytowej"," bik "],
    "#KartaKredytowa":    ["karta kredytowa","kartą kredytową","credit card"],
    "#KredytHipoteczny":  ["kredyt hipoteczny","hipoteczn","mortgage","hipoteka"],
    "#KredytGotowkowy":   ["kredyt gotówkowy","gotówkow","gotowkow","cash loan","kredyt konsumencki"],
    "#LimitROR":          ["limit ror","debet","rachunek oszczędnościowo-rozliczeniowy"],
    "#SKD":               ["sankcja kredytu darmowego","skd"],
    "#WakacjeKredytowe":  ["wakacje kredytowe"],
    "#Windykacja":        ["windykacj","wezwanie do zapłaty","zaległość","inkasso"],
    "#RODO":              ["rozporządzenie o ochronie danych","rodo","gdpr","dane osobowe"],
}

# Skompilowane raz przy starcie – nie przy każdym pliku
PATH_TAG_RULES = [
    (re.compile(r"BNP.Paribas|BNP_Paribas", re.I),                       ["#BNPParibas","#BANKI"]),
    (re.compile(r"PKO.BP|PKO_BP|PKOBP|Powszechna.Kasa", re.I),           ["#PKOBP","#BANKI"]),
    (re.compile(r"Revolut", re.I),                                         ["#Revolut","#BANKI"]),
    (re.compile(r"WPS48|WS48|wspolnota|wita.stwosz|manhattan", re.I),     ["#WS48","#Nieruchomosc"]),
    (re.compile(r"Kaczmarski|inkasso", re.I),                              ["#KaczmarskiInkasso","#Windykacja"]),
    (re.compile(r"CreditAngel", re.I),                                     ["#CreditAngel"]),
    (re.compile(r"UODO|ochrony.danych", re.I),                             ["#UODO","#RODO"]),
    (re.compile(r"UOKiK", re.I),                                           ["#UOKiK"]),
    (re.compile(r"\bBIK\b|biuro.informacji.kredyt", re.I),                ["#BIK"]),
    (re.compile(r"karta.kredyt|kredyt.kart", re.I),                        ["#KartaKredytowa","#BANKI"]),
    (re.compile(r"kredyt.hipot|hipotecz", re.I),                           ["#KredytHipoteczny","#BANKI"]),
    (re.compile(r"kredyt.gotow|gotowkow|got.wkow", re.I),                  ["#KredytGotowkowy","#BANKI"]),
    (re.compile(r"limit.ror|debet.ror", re.I),                             ["#LimitROR","#BANKI"]),
    (re.compile(r"sankcja.kredyt|\bskd\b", re.I),                        ["#SKD","#BANKI"]),
    (re.compile(r"wakacje.kredyt", re.I),                                  ["#WakacjeKredytowe","#BANKI"]),
    (re.compile(r"windykacj|wezwanie.do.zap", re.I),                       ["#Windykacja"]),
    (re.compile(r"\bRODO\b|GDPR|ochrona.danych", re.I),                  ["#RODO"]),
    (re.compile(r"reklamacj", re.I),                                        ["#Reklamacja"]),
    (re.compile(r"\bskarg", re.I),                                         ["#Skarga"]),
    (re.compile(r"wypowiedzen", re.I),                                      ["#Pismo"]),
    (re.compile(r"umow[ae]", re.I),                                         ["#Umowa"]),
    (re.compile(r"wyci.g|wyciag", re.I),                                   ["#Wyciag"]),
    (re.compile(r"harmonogram", re.I),                                      ["#Harmonogram"]),
    (re.compile(r"oswiadczen|o.wiadczen", re.I),                            ["#Oswiadczenie"]),
    (re.compile(r"wniosek|wniosk", re.I),                                   ["#Wniosek"]),
    (re.compile(r"faktura", re.I),                                          ["#Faktura"]),
    (re.compile(r"ugoda", re.I),                                            ["#Ugoda"]),
    (re.compile(r"regulamin", re.I),                                        ["#Regulamin"]),
    (re.compile(r"transkrypcj|transcript", re.I),                          ["#Transkrypcja"]),
    (re.compile(r"decyzja|decyzj", re.I),                                   ["#Decyzja"]),
    (re.compile(r"protokol|protok..", re.I),                                ["#Protokol"]),
    (re.compile(r"\bcv\b|resume|curriculum.vitae", re.I),                ["#CV","#Kariera"]),
    (re.compile(r"linkedin|kariera", re.I),                                 ["#Kariera"]),
    (re.compile(r"NFZ|narodowy.fundusz.zdrowia", re.I),                    ["#Zdrowie"]),
    (re.compile(r"\bZUS\b", re.I),                                       ["#Zdrowie"]),
    (re.compile(r"urzad.pracy|urz.d.pracy|\bPUP\b|\bWUP\b|\bIPD\b", re.I),["#UrzadPracy","#Kariera"]),
    (re.compile(r"youth.rebuild|youthrebuild", re.I),                      ["#YouthRebuild"]),
    (re.compile(r"\bgecko\b", re.I),                                     ["#Gecko"]),
    (re.compile(r"\bweles\b", re.I),                                     ["#Weles"]),
    (re.compile(r"screenshot|zrzut.ekranu", re.I),                         ["#Screenshot"]),
    (re.compile(r"nagranie|recording|screen.rec", re.I),                   ["#Nagranie"]),
    (re.compile(r"za..[aą]cznik|attachment", re.I),                        ["#Zalacznik"]),
    (re.compile(r"branding|\blogo\b", re.I),                             ["#Branding"]),
    (re.compile(r"[\ \-_](?:kopia|copy|duplikat|\d+)[\ \-_.]", re.I),     ["#Duplikat"]),
]

KNOWN_CONTEXT = (
    "Wlasciciel: Adrian Wolczuk, Elblag, front-end developer. "
    "Aktywne sprawy: BNP Paribas (karta kredytowa 5285, kredyt gotowkowy, SKD), "
    "PKO BP (limit ROR), Revolut (karta), Kaczmarski Inkasso (windykacja BNP), "
    "CreditAngel (branding/projekt), WS48 (wspolnota mieszkaniowa Wita Stwosza 48), "
    "YouthRebuild (projekt spoleczny), urzad pracy (IPD, RODO-zgody)."
)

# Komentarze-wzorce używane do walidacji złych odpowiedzi LLM (lowercase)
BAD_COMMENTS = {
    "jedno zdanie po polsku",
    "jedno zdanie po polsku.",
    "brak danych",
    "brak pewnych danych",
    "brak tekstu",
    "plik graficzny",
    "plik wideo",
    "rak informacji",
}


# ─── HELPERS ──────────────────────────────────────────────────────────────────
def normalize_tag(tag):
    if not isinstance(tag, str): return None
    tag = tag.strip()
    if not tag: return None
    if not tag.startswith("#"): tag = "#" + tag
    tag = TAG_ALIASES.get(tag, tag)
    return tag if tag in ALLOWED_TAGS else None


def merge_tags(*tag_lists):
    seen = []
    for lst in tag_lists:
        for t in (lst or []):
            n = normalize_tag(t)
            if n and n not in seen: seen.append(n)
    return seen


def is_excluded(path):
    return any(p in EXCLUDED_FOLDERS for p in Path(path).parts)


# ─── ZAPIS METADANYCH macOS ───────────────────────────────────────────────────
def _run_applescript(lines):
    subprocess.run(["osascript", "-e", "\n".join(lines)], capture_output=True, check=False)


def clear_macos_metadata(path):
    try:
        a = xattr.xattr(path)
        for k in ("com.apple.metadata:_kMDItemUserTags",
                  "com.apple.metadata:kMDItemFinderComment",
                  "com.apple.metadata:kMDItemComment"):
            try: a.remove(k)
            except (KeyError, OSError): pass
    except Exception: pass
    fp = path.replace('"', '\\"')
    _run_applescript([
        f'set theFile to (POSIX file "{fp}" as alias)',
        'tell application "Finder"',
        'set comment of theFile to ""',
        'end tell'
    ])


def set_macos_metadata(path, tags, comment):
    tags    = merge_tags(tags)
    comment = (comment or "").strip()[:500]
    try:
        a = xattr.xattr(path)
        a.set("com.apple.metadata:_kMDItemUserTags",
              plistlib.dumps(tags, fmt=plistlib.FMT_BINARY))
        a.set("com.apple.metadata:kMDItemFinderComment",
              plistlib.dumps(comment, fmt=plistlib.FMT_BINARY))
        fp = path.replace('"', '\\"')
        c  = comment.replace('"', "'")
        _run_applescript([
            f'set theFile to (POSIX file "{fp}" as alias)',
            'tell application "Finder"',
            f'set comment of theFile to "{c}"',
            'end tell'
        ])
        return True
    except Exception as e:
        print(f"  ⚠️  Błąd zapisu: {e}")
        return False


# ─── OCR ──────────────────────────────────────────────────────────────────────
def get_ocr_text(path):
    import fitz
    from ocrmac import ocrmac as ocr

    ext = Path(path).suffix.lower()

    if ext == ".pdf":
        # 1. Tekst osadzony (PyMuPDF) – dla PDF wektorowych, bardzo szybko
        try:
            doc  = fitz.open(path)
            text = "".join(doc[i].get_text() for i in range(min(4, len(doc))))
            doc.close()
            if len(text.strip()) > 80:
                return text[:OCR_MAX_CHARS]
        except Exception:
            pass

        # 2. Skan PDF – renderuj przez PyMuPDF → ocrmac (bez pdf2image)
        try:
            doc   = fitz.open(path)
            parts = []
            for i in range(min(3, len(doc))):
                pix = doc[i].get_pixmap(dpi=200)
                tmp = f"/tmp/tagger_ocr_{i}.png"
                pix.save(tmp)
                hits = ocr.OCR(tmp, language_preference=["pl-PL", "en-US"]).recognize()
                parts.append(" ".join(h[0] for h in hits if h[0]))
            doc.close()
            return "\n".join(parts)[:OCR_MAX_CHARS]
        except Exception as e:
            return f"[Błąd OCR PDF: {e}]"

    elif ext in {".png", ".jpg", ".jpeg", ".webp"}:
        try:
            hits = ocr.OCR(path, language_preference=["pl-PL", "en-US"]).recognize()
            return " ".join(h[0] for h in hits if h[0])[:OCR_MAX_CHARS]
        except Exception:
            return ""

    return ""


# ─── PRE-TAGOWANIE (ścieżka + OCR) ──────────────────────────────────────────
def pre_tag_from_path(file_path, ocr_text=""):
    combined = (file_path.replace("/", " ").replace("\\", " ")
                         .replace("_", " ").replace("-", " ")
                + " " + ocr_text)
    tags = []
    for pattern, tag_list in PATH_TAG_RULES:
        if pattern.search(combined):
            tags = merge_tags(tags, tag_list)
    ext = Path(file_path).suffix.lower()
    if ext == ".eml":
        tags = merge_tags(tags, ["#Email"])
    elif ext in VIDEO_EXT:
        tags = merge_tags(tags, ["#Nagranie"])
    elif ext in {".png", ".jpg", ".jpeg", ".webp"} and not ocr_text.strip():
        tags = merge_tags(tags, ["#Grafika"])
    return tags


# ─── OLLAMA ───────────────────────────────────────────────────────────────────
def ollama_generate(payload, timeout=90):
    try:
        r = requests.post(OLLAMA_URL, json=payload, timeout=timeout)
        r.raise_for_status()
        return r.json().get("response", "").strip()
    except requests.ConnectionError:
        print("  ⚠️  Ollama niedostępna (brak połączenia). Używam tylko pre-tagów.")
        return ""
    except requests.Timeout:
        print("  ⚠️  Ollama timeout. Używam tylko pre-tagów.")
        return ""
    except Exception as e:
        print(f"  ⚠️  Błąd Ollama: {e}. Używam tylko pre-tagów.")
        return ""


def parse_json_safe(raw):
    try: return json.loads(raw.strip())
    except Exception: pass
    m = re.search(r"\{[^{}]+\}", raw, re.DOTALL)
    if m:
        try: return json.loads(m.group())
        except Exception: pass
    return {}


# ─── WNIOSKOWANIE LLAMA3 ─────────────────────────────────────────────────────
def infer_tags_with_llm(file_name, ext, pre_tags, ocr_text):
    pre_str    = ", ".join(pre_tags) if pre_tags else "brak"
    ocr_trim   = ocr_text[:LLM_OCR_MAX_CHARS].strip() if ocr_text else "(brak tekstu – plik graficzny/wideo)"
    safe_str   = "\n".join(sorted(ALLOWED_TAGS - STRICT_TAGS - {"#AI_Sorted"}))
    strict_str = "\n".join(sorted(STRICT_TAGS))

    prompt = (
        "Klasyfikujesz prywatne pliki w języku polskim i angielskim. Bądź OSTROŻNY i PRECYZYJNY.\n"
        "Zwróć WYŁĄCZNIE poprawny JSON (bez markdown, bez komentarzy):\n"
        '{"tags": ["#Tag1", "#Tag2"], "comment": "..."}\n\n'
        f"PLIK:\n"
        f"- nazwa: {file_name}\n"
        f"- rozszerzenie: {ext}\n"
        f"- pre_tags (z nazwy/ścieżki/OCR – ZAWSZE uwzględnij): {pre_str}\n"
        f"- tekst z dokumentu (OCR):\n{ocr_trim}\n\n"
        f"KONTEKST (tylko informacyjnie):\n{KNOWN_CONTEXT}\n\n"
        "ZASADY TAGOWANIA:\n"
        "1. Zawsze uwzględnij wszystkie pre_tags.\n"
        "2. Tagi BEZPIECZNE dodaj jeśli wynikają z OCR lub nazwy.\n"
        "3. Tagi STRICT dodaj TYLKO gdy słowo kluczowe DOSŁOWNIE jest w OCR/nazwie:\n"
        "   #BNPParibas → 'BNP Paribas', #KartaKredytowa → 'karta kredytowa',\n"
        "   #KredytHipoteczny → 'hipoteczn', #KredytGotowkowy → 'gotówkow',\n"
        "   #RODO → 'RODO' lub 'dane osobowe'. BEZ DOWODU – NIE DODAWAJ.\n"
        "4. Zwróć 2-5 tagów.\n"
        "5. Bez tekstu OCR: użyj tylko pre_tags + #Grafika/#Foto.\n\n"
        "ZASADY KOMENTARZA:\n"
        "- Napisz JEDNO konkretne zdanie po polsku opisujące WYŁĄCZNIE ten plik.\n"
        "- Komentarz musi wynikać z nazwy pliku lub treści OCR – nie wymyślaj.\n"
        "- NIE używaj żadnych przykładów z tej instrukcji jako komentarza.\n"
        "- Format: co to jest + czego dotyczy. "
        "  Dla CV: 'CV Adriana Wołczuka z datą [rok].' "
        "  Dla faktury: 'Faktura od [wystawca] za [usługa].' "
        "  Dla pisma bankowego: 'Pismo BNP Paribas dotyczące [temat].' "
        "  Dla grafiki bez tekstu: 'Grafika: [co widać na podstawie nazwy pliku].'\n\n"
        f"TAGI BEZPIECZNE:\n{safe_str}\n\n"
        f"TAGI STRICT (tylko z dowodem w OCR/nazwie):\n{strict_str}"
        "RESTRYKCJE:\n"
        "1. Jeśli tekst OCR ma < 10 słów i nie ma tam imienia Adrian, NIE pisz, że to Twoje CV.\n"
        "2. Komentarz musi być UNIKALNY. Nie używaj frazy '[rok]'. Jeśli nie znasz daty, nie pisz o niej.\n"
        "3. BĄDŹ SCEPTYCZNY. Lepiej dać 1 tag (#Grafika) niż 5 błędnych.\n\n"
    )
    
    raw = ollama_generate({
        "model":   TEXT_MODEL,
        "prompt":  prompt,
        "stream":  False,
        "format":  "json",
        "options": {"temperature": 0.15, "num_predict": 300}
    }, timeout=90)

    if not raw:
        return {"tags": merge_tags(pre_tags)[:6], "comment": f"Plik: {file_name}."}

    try:
        data     = parse_json_safe(raw)
        llm_tags = data.get("tags", []) if isinstance(data.get("tags"), list) else []

        # Weryfikacja strict tagów – szukaj dowodu w OCR + nazwie pliku
        evidence  = (file_name + " " + ocr_text).lower()
        clean_llm = []
        for tag in llm_tags:
            n = normalize_tag(tag)
            if n is None: continue
            if n in STRICT_TAGS:
                kws = STRICT_EVIDENCE_MAP.get(n, [])
                if any(k in evidence for k in kws): clean_llm.append(n)
            else:
                clean_llm.append(n)

        # Kontekstualne guardy
        block_bank = {"#KredytHipoteczny","#KredytGotowkowy","#LimitROR","#BANKI","#KartaKredytowa"}
        is_ws48  = "#WS48"         in pre_tags or "wita stwosza" in evidence or "ws48"        in evidence
        is_urzad = "#UrzadPracy"   in pre_tags
        is_cv    = "#CV"           in pre_tags
        is_youth = "#YouthRebuild" in pre_tags or "youthrebuild" in evidence
        no_ocr   = not ocr_text.strip() and ext in {".png",".jpg",".jpeg",".webp"}

        if is_ws48:  clean_llm = [t for t in clean_llm if t not in block_bank]
        if is_urzad: clean_llm = [t for t in clean_llm if t not in (block_bank | {"#SKD","#WakacjeKredytowe"})]
        if is_cv:    clean_llm = [t for t in clean_llm if t not in block_bank]
        if is_youth: clean_llm = [t for t in clean_llm if t not in (STRICT_TAGS - {"#RODO"})]
        if no_ocr:   clean_llm = [t for t in clean_llm if t not in STRICT_TAGS]
        
        # Jeśli w tekście nie ma słowa 'bank', 'bnp', 'pko', 'revolut' - usuń tag #BANKI
        if "#BANKI" in clean_llm:
            bank_keywords = ["bank", "pko", "bnp", "revolut", "kredyt", "wyciąg", "prowizja"]
            if not any(k in evidence for k in bank_keywords):
                clean_llm.remove("#BANKI")
        
        # Jeśli to logo/grafika i model chce dać #CV - zablokuj
        if "#Grafika" in clean_llm and "#CV" in clean_llm:
            clean_llm.remove("#CV")

        # Priorytetyzacja: strict tagi pierwsze, potem pre_tags, potem reszta LLM
        strict_found = [t for t in clean_llm if t in STRICT_TAGS]
        rest_llm     = [t for t in clean_llm if t not in STRICT_TAGS]
        final        = merge_tags(strict_found, pre_tags, rest_llm)

        # #Skan tylko dla PDF które przeszły przez OCR na pixmapie (nie wektorowe)
        if ext == ".pdf" and ocr_text.strip() and "#Skan" not in final:
            final = merge_tags(final, ["#Skan"])

        # Walidacja komentarza
        comment = data.get("comment", "")
        comment_clean = comment.strip().lower() if isinstance(comment, str) else ""
        is_bad = (
            not comment_clean
            or any(bad in comment_clean for bad in BAD_COMMENTS)
            or len(comment_clean) < 10
        )
        if is_bad:
            comment = f"Plik: {file_name}."

        return {"tags": final[:6], "comment": comment.strip()[:500]}

    except Exception:
        return {"tags": merge_tags(pre_tags)[:6], "comment": f"Plik: {file_name}."}


# ─── MAIN ────────────────────────────────────────────────────────────────────
def main():
    if not os.path.exists(SOURCE_DIR):
        print(f"❌ Folder nie istnieje: {SOURCE_DIR}"); return
    print(f"🚀 Kategoryzuję pliki w: {SOURCE_DIR}")
    print(f"   Model: {TEXT_MODEL}  |  OCR: ocrmac (Apple Vision) + PyMuPDF")
    if EXCLUDED_FOLDERS: print(f"   🚫 Wykluczone: {sorted(EXCLUDED_FOLDERS)}")
    print()

    all_files = []
    for root, dirs, files in os.walk(SOURCE_DIR):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in EXCLUDED_FOLDERS]
        for f in files:
            if not f.startswith("."):
                p = os.path.join(root, f)
                if not is_excluded(p): all_files.append(p)
    print(f"📁 Plików: {len(all_files)}\n")

    stats = {"ok": 0, "pre": 0, "skip": 0, "err": 0}
    for path in all_files:
        name = os.path.basename(path)
        rel  = os.path.relpath(path, SOURCE_DIR)
        ext  = Path(path).suffix.lower()
        if ext in SKIP_EXT:
            stats["skip"] += 1; continue

        print(f"🔍 {rel}")
        clear_macos_metadata(path)

        # OCR
        ocr_text = ""
        if ext in OCR_EXT:
            print("  📖 OCR…", end=" ", flush=True)
            ocr_text = get_ocr_text(path)
            print(f"{len(ocr_text.split())} słów")
        elif ext in VIDEO_EXT:
            print("  🎬 Wideo")
        else:
            print(f"  📄 {ext}")

        # Pre-tagi
        pre_tags = pre_tag_from_path(path, ocr_text)

        # Optymalizacja: jeśli ≥4 pre_tags i brak OCR → pomiń AI
        if len(pre_tags) >= 4 and not ocr_text.strip():
            final_tags    = merge_tags(pre_tags, ["#AI_Sorted"])
            final_comment = f"Auto z nazwy/ścieżki: {name}."
            stats["pre"] += 1
            print(f"  ⚡ Pre: {pre_tags}")
        else:
            print("  🧠 Mistral-Nemo…")
            meta          = infer_tags_with_llm(name, ext, pre_tags, ocr_text)
            final_tags    = merge_tags(meta.get("tags", []), ["#AI_Sorted"])
            final_comment = meta.get("comment", f"Plik: {name}.")

        if set_macos_metadata(path, final_tags, final_comment):
            print(f"  ✅ {final_tags}")
            print(f"  📝 {final_comment}\n")
            stats["ok"] += 1
        else:
            stats["err"] += 1
            print()

    print("=" * 55)
    print("✨ GOTOWE!")
    print(f"   ✅ Sukces:       {stats['ok']}")
    print(f"   ⚡ Pre (bez AI): {stats['pre']}")
    print(f"   ⏭  Pominięte:   {stats['skip']}")
    print(f"   ❌ Błędy:        {stats['err']}")


if __name__ == "__main__":
    main()