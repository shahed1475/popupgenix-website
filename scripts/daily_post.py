"""Daily content agent: draft a blog post with Claude, render a branded cover image,
upload both to WordPress.com. Drafts by default (human review first).

Env: ANTHROPIC_API_KEY, WPCOM_TOKEN (WordPress.com OAuth bearer token),
     WP_SITE (default shahedalfahad19-xvmtl.wordpress.com),
     POST_STATUS (draft|publish, default draft), DRY_RUN=1 to skip WordPress writes.
"""
import json, os, pathlib, re, sys, urllib.request
import requests
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = os.environ.get("WP_SITE", "shahedalfahad19-xvmtl.wordpress.com")
API = f"https://public-api.wordpress.com/wp/v2/sites/{SITE}"
STATUS = os.environ.get("POST_STATUS", "draft")
MODEL = os.environ.get("CHAT_MODEL", "claude-sonnet-5-5")

BRAND = """You write for PopupGenix, a founder-led studio building AI sales agents, custom software and automation.
Voice: clear, practical, plain English, no hype, no emojis, no invented statistics, clients or quotes.
Audience: owners of small and growing businesses. Every post teaches one useful thing and ends with a soft invitation to talk."""

def recent_titles():
    try:
        r = requests.get(f"{API}/posts", params={"per_page": 30, "_fields": "title"}, timeout=30)
        return [p["title"]["rendered"] for p in r.json()]
    except Exception:
        return []

def draft_post(avoid):
    prompt = f"""Write one blog post (600-800 words) that is NOT about any of these existing topics:
{json.dumps(avoid)}
Choose a practical topic from: AI sales agents, lead response time, workflow automation, custom software vs off-the-shelf, CRM hygiene, small-business AI adoption.
Return ONLY JSON: {{"title": str (max 70 chars), "excerpt": str (max 160 chars), "cover_kicker": str (2-4 words, shown on the image), "html": str (valid HTML using only h2, p, ul, li, strong; no h1)}}"""
    r = requests.post("https://api.anthropic.com/v1/messages", timeout=120,
        headers={"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json={"model": MODEL, "max_tokens": 3000, "system": BRAND, "messages": [{"role": "user", "content": prompt}]})
    r.raise_for_status()
    text = "".join(c.get("text", "") for c in r.json()["content"])
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        sys.exit("Model returned no JSON; nothing was posted.")
    try:
        post = json.loads(m.group(0))
    except json.JSONDecodeError as e:
        sys.exit(f"Model returned invalid JSON ({e}); nothing was posted.")
    missing = {"title", "excerpt", "cover_kicker", "html"} - post.keys()
    if missing:
        sys.exit(f"Model JSON is missing {sorted(missing)}; nothing was posted.")
    return post

def esc(s): return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def render_cover(title, kicker, out):
    logo = (ROOT / "public/popupgenix-logo.svg").read_text().replace("<svg ", '<svg width="110" height="110" ', 1)
    html = f"""<html><body style="margin:0;width:1600px;height:900px;box-sizing:border-box;font-family:Inter,Helvetica,Arial,sans-serif;color:#fff;
background:radial-gradient(1100px 650px at 90% -10%,#2B45F588,transparent),radial-gradient(900px 650px at -10% 110%,#0AA4FF55,transparent),#0a0a0b;
display:flex;flex-direction:column;justify-content:center;padding:0 130px">
<div style="display:flex;align-items:center;gap:22px">{logo}<span style="font-size:44px;font-weight:700">PopupGenix</span></div>
<div style="margin-top:56px;font-size:32px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#FFC247">{esc(kicker)}</div>
<div style="margin-top:20px;font-size:92px;font-weight:800;letter-spacing:-3px;line-height:1.04;max-width:1300px">{esc(title)}</div>
<div style="position:absolute;left:130px;right:130px;bottom:70px;height:6px;border-radius:3px;background:linear-gradient(90deg,#2B45F5,#0AA4FF,transparent)"></div></body></html>"""
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1600, "height": 900})
        pg.set_content(html); pg.wait_for_timeout(300); pg.screenshot(path=str(out)); b.close()

def main():
    post = draft_post(recent_titles())
    cover = ROOT / "daily-cover.png"
    render_cover(post["title"], post["cover_kicker"], cover)
    print("Drafted:", post["title"])
    if os.environ.get("DRY_RUN"):
        print(post["excerpt"]); return
    h = {"Authorization": f"Bearer {os.environ['WPCOM_TOKEN']}"}
    with open(cover, "rb") as f:
        m = requests.post(f"{API}/media", headers={**h, "Content-Disposition": 'attachment; filename="cover.png"', "Content-Type": "image/png"}, data=f.read(), timeout=120)
    m.raise_for_status(); media_id = m.json()["id"]
    p = requests.post(f"{API}/posts", headers=h, timeout=60, json={
        "title": post["title"], "content": post["html"], "excerpt": post["excerpt"], "status": STATUS, "featured_media": media_id})
    p.raise_for_status(); print("WordPress post:", p.json().get("link"), "status:", STATUS)

if __name__ == "__main__":
    sys.exit(main())
