import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "worker"))
from collect import parse_job_page  # noqa: E402
from pipeline import dedupe, matches  # noqa: E402

CFG = json.load(open(os.path.join(os.path.dirname(__file__), "..", "config.json")))


def job(title, desc="python", loc="Brazil", url="https://x.com/1", company="Acme", source="remotive"):
    return {"title": title, "description": desc, "location": loc, "url": url, "company": company, "source": source}


class T(unittest.TestCase):
    def test_accepts_junior_java(self):
        self.assertTrue(matches(job("Java Developer Junior", "spring"), CFG)[0])

    def test_rejects_senior(self):
        self.assertFalse(matches(job("Senior Python Developer"), CFG)[0])

    def test_rejects_wrong_location(self):
        self.assertFalse(matches(job("Python Developer", loc="USA only"), CFG)[0])

    def test_no_salary_not_excluded(self):
        self.assertTrue(matches(job("Backend Developer"), CFG)[0])

    def test_dedupe_across_sources(self):
        a = job("Python Developer", url="https://a.com/1")
        b = job("python  developer!", url="https://b.com/9?utm=1")
        new, seen = dedupe([a, b], {})
        self.assertEqual(len(new), 1)
        new2, _ = dedupe([a], seen)
        self.assertEqual(new2, [])

    def test_jsonld_parse(self):
        html = '<script type="application/ld+json">{"@type":"JobPosting","title":"Dev Java","hiringOrganization":{"name":"X"},"description":"<p>Spring</p>"}</script>'
        p = parse_job_page(html, "https://x.com/v")
        self.assertEqual((p["title"], p["company"], p["description"]), ("Dev Java", "X", "Spring"))


if __name__ == "__main__":
    unittest.main()
