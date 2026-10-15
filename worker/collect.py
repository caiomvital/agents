"""Coleta vagas de fontes abertas e de URLs manuais, sem login e sem contornar bloqueios."""
import json
import re
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from html import unescape

UA = {"User-Agent": "job-worker/1.0 (+personal use)"}


def _get(url, timeout=20):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")


def _strip(html):
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", html or ""))).strip()


def collect_remotive(searches):
    jobs = []
    for term in searches:
        url = "https://remotive.com/api/remote-jobs?" + urllib.parse.urlencode({"search": term, "limit": 50})
        for j in json.loads(_get(url)).get("jobs", []):
            jobs.append({
                "source": "remotive", "external_id": str(j["id"]), "title": j["title"],
                "company": j["company_name"], "location": j.get("candidate_required_location", ""),
                "work_mode": "remoto", "salary_text": j.get("salary", ""),
                "description": _strip(j.get("description", ""))[:4000],
                "url": j["url"], "published_at": j.get("publication_date", ""),
            })
    return jobs


def collect_rss(feeds):
    jobs = []
    for feed in feeds:
        root = ET.fromstring(_get(feed))
        for it in root.iter("item"):
            raw = it.findtext("title", "")
            company, _, title = raw.partition(": ")
            jobs.append({
                "source": "rss:" + urllib.parse.urlparse(feed).netloc, "external_id": it.findtext("guid", ""),
                "title": title or raw, "company": company if title else "",
                "location": it.findtext("{*}region", "") or "remote", "work_mode": "remoto", "salary_text": "",
                "description": _strip(it.findtext("description", ""))[:4000],
                "url": it.findtext("link", ""), "published_at": it.findtext("pubDate", ""),
            })
    return jobs


def parse_job_page(html, url):
    """Extrai dados de uma página; usa JSON-LD JobPosting quando existir, senão metadados básicos."""
    for m in re.finditer(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', html, re.S | re.I):
        try:
            data = json.loads(m.group(1))
        except ValueError:
            continue
        for d in (data if isinstance(data, list) else [data]):
            if isinstance(d, dict) and d.get("@type") == "JobPosting":
                org = d.get("hiringOrganization") or {}
                loc = d.get("jobLocation") or {}
                loc = loc[0] if isinstance(loc, list) and loc else loc
                addr = (loc.get("address") or {}) if isinstance(loc, dict) else {}
                return {
                    "source": "manual", "external_id": url, "title": d.get("title", ""),
                    "company": org.get("name", "") if isinstance(org, dict) else "",
                    "location": addr.get("addressLocality", "") if isinstance(addr, dict) else "",
                    "work_mode": "remoto" if d.get("jobLocationType") == "TELECOMMUTE" else "",
                    "salary_text": "", "description": _strip(d.get("description", ""))[:4000],
                    "url": url, "published_at": d.get("datePosted", ""),
                }
    t = re.search(r'<meta[^>]+og:title[^>]+content="([^"]+)"', html, re.I) or re.search(r"<title>(.*?)</title>", html, re.S | re.I)
    return {"source": "manual", "external_id": url, "title": _strip(t.group(1)) if t else url, "company": "",
            "location": "", "work_mode": "", "salary_text": "", "description": _strip(html)[:4000],
            "url": url, "published_at": ""}


def collect_manual(path):
    jobs = []
    try:
        lines = open(path, encoding="utf-8").read().splitlines()
    except FileNotFoundError:
        return jobs
    for line in lines:
        url = line.strip()
        if not url or url.startswith("#") or not re.match(r"^https?://", url):
            continue
        try:
            jobs.append(parse_job_page(_get(url), url))
        except Exception as e:  # página bloqueada/offline: segue para a próxima
            print(f"manual: falha em {url}: {e}")
    return jobs
