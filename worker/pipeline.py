"""Filtro, deduplicação e estado. Nada aqui envia candidatura."""
import hashlib
import re
import unicodedata


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", s)).strip()


def job_key(job):
    base = norm(job.get("company", "")) + "|" + norm(job.get("title", ""))
    return hashlib.sha1(base.encode()).hexdigest()[:16]


def canonical_url(url):
    return re.sub(r"[?#].*$", "", (url or "").lower()).rstrip("/")


def has_word(text, term):
    return re.search(r"(?<![a-z0-9])" + re.escape(norm(term)) + r"(?![a-z0-9])", norm(text)) is not None


def matches(job, cfg):
    title = job["title"]
    if any(has_word(title, x) for x in cfg["exclude_title_any"]):
        return False, "cargo/senioridade fora do perfil"
    if not any(has_word(title, x) for x in cfg["title_must_match_any"]):
        return False, "título fora do perfil"
    text = title + " " + job.get("description", "")
    if not any(has_word(text, k) for k in cfg["keywords_any"]):
        return False, "sem tecnologia do perfil"
    if job["source"] != "manual":
        loc = norm(job.get("location", "")) or "remote"
        if not any(norm(x) in loc for x in cfg["allowed_locations_any"]):
            return False, "localização"
    return True, ""


def dedupe(jobs, seen):
    """seen: {key: {"urls": [...]}}. Retorna (novas, seen_atualizado). Fontes repetidas são associadas à mesma vaga."""
    url_index = {canonical_url(u): k for k, v in seen.items() for u in v["urls"]}
    new, batch = [], {}
    for j in jobs:
        key = url_index.get(canonical_url(j["url"])) or job_key(j)
        if key in seen:
            if j["url"] not in seen[key]["urls"]:
                seen[key]["urls"].append(j["url"])
            continue
        if key in batch:
            batch[key]["alt_urls"].append(j["url"])
            continue
        j = dict(j, key=key, alt_urls=[])
        batch[key] = j
        new.append(j)
        seen[key] = {"urls": [j["url"]], "title": j["title"], "company": j["company"]}
    return new, seen
