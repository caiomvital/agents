import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from collect import collect_manual, collect_remotive, collect_rss  # noqa: E402
from pipeline import dedupe, matches  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(path, default):
    try:
        return json.load(open(os.path.join(ROOT, path), encoding="utf-8"))
    except FileNotFoundError:
        return default


def main():
    cfg = load("config.json", {})
    seen = load("data/seen.json", {})
    jobs = []
    for name, fn in [("remotive", lambda: collect_remotive(cfg["remotive_searches"])),
                     ("rss", lambda: collect_rss(cfg["rss_feeds"])),
                     ("manual", lambda: collect_manual(os.path.join(ROOT, "data/manual_urls.txt")))]:
        try:
            got = fn()
            print(f"{name}: {len(got)} vagas")
            jobs += got
        except Exception as e:  # uma fonte fora do ar não derruba as outras
            print(f"{name}: falhou: {e}")
    kept = [j for j in jobs if matches(j, cfg)[0]]
    new, seen = dedupe(kept, seen)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    for j in new:
        j["discovered_at"] = now
        j["status"] = "descoberta"  # nenhuma vaga sai daqui candidatada
    pending = load("data/vagas_novas.json", [])
    with open(os.path.join(ROOT, "data/vagas_novas.json"), "w", encoding="utf-8") as f:
        json.dump(pending + new, f, ensure_ascii=False, indent=2)
    with open(os.path.join(ROOT, "data/seen.json"), "w", encoding="utf-8") as f:
        json.dump(seen, f, ensure_ascii=False, indent=1)
    print(f"coletadas={len(jobs)} compatíveis={len(kept)} novas={len(new)}")


if __name__ == "__main__":
    main()
