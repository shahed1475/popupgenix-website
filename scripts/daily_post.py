"""Daily content agent (free tier): drafts one blog post with Cloudflare Workers AI,
checks it against the same facts and validator the chat agent uses, renders a branded
cover, and uploads both to WordPress.com. Drafts by default (human review first).

Cost: two model calls (outline, then draft), roughly 100 of the 10,000 free Neurons per day.

Env:
  CF_ACCOUNT_ID, CF_API_TOKEN   Cloudflare account ID and an API token with Workers AI permission
  WPCOM_TOKEN                   WordPress.com OAuth bearer token (not needed with DRY_RUN=1)
  WP_SITE                       default shahedalfahad19-xvmtl.wordpress.com
  POST_STATUS                   draft (default) or publish. A post that fails validation is always a draft.
  DRY_RUN=1                     draft and validate, write daily-draft.html, do not touch WordPress
  TOPIC                         optional topic override
  COVER_BG=1                    add a text-free FLUX.1 [schnell] background under the cover (Apache 2.0)
  DAILY_MODEL / DAILY_FALLBACK_MODEL   override the pinned model IDs

Run `npm run knowledge && npm run agent:bundle` first (the workflow does this).
"""
import base64, datetime, json, os, pathlib, re, subprocess, sys, time
import requests
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = os.environ.get("WP_SITE", "shahedalfahad19-xvmtl.wordpress.com")
API = f"https://public-api.wordpress.com/wp/v2/sites/{SITE}"
STATUS = os.environ.get("POST_STATUS", "draft")
MODEL = os.environ.get("DAILY_MODEL", "@cf/google/gemma-4-26b-a4b-it")
FALLBACK = os.environ.get("DAILY_FALLBACK_MODEL", "@cf/meta/llama-3.1-8b-instruct-fp8-fast")
IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell"
CF = f"https://api.cloudflare.com/client/v4/accounts/{os.environ.get('CF_ACCOUNT_ID', '')}/ai/run"
ALLOWED_TAGS = {"h2", "p", "ul", "li", "strong", "em"}

KNOWLEDGE = json.loads((ROOT / "agent/generated/knowledge.json").read_text())

BRAND = """You write for PopupGenix, a founder-led studio building AI sales agents, custom software and automation.
Voice: clear, practical, plain English, no hype, no emojis.
Audience: owners of small and growing businesses. Every post teaches one useful thing and ends with a soft invitation to talk.
Hard rules:
- Use ONLY the FACTS for anything about PopupGenix: services, prices, clients, products, contact details.
- The only price you may state is $500 per month for the Starter plan. Never state other prices, discounts or guarantees.
- Never invent clients, case-study results, statistics, percentages, quotes or awards. General advice is fine.
- If you cite a study, use only the APPROVED STUDIES below, name the source, and do not add numbers.
- Inno AI and the AI Sales Employee are in development: never describe them as finished or available.
- Link only to popupgenix.com (for example popupgenix.com/contact)."""


def facts_block():
    kinds = {"company", "pricing", "contact", "service", "process", "faq", "case"}
    return "\n".join(f"- [{c['id']}] {c['text']}" for c in KNOWLEDGE["chunks"] if c["kind"] in kinds)


def studies_block():
    return "\n".join(f"- {s['claim']} (Source: {s['source']})" for s in KNOWLEDGE["stats"])


def cf_run(model, messages, max_tokens, temperature=0.4):
    """Call Workers AI over REST. Returns text. Raises RuntimeError on failure."""
    if not os.environ.get("CF_ACCOUNT_ID") or not os.environ.get("CF_API_TOKEN"):
        raise RuntimeError("CF_ACCOUNT_ID and CF_API_TOKEN are required")
    last = ""
    for attempt in range(2):
        try:
            r = requests.post(f"{CF}/{model}", timeout=180,
                headers={"Authorization": f"Bearer {os.environ['CF_API_TOKEN']}"},
                json={"messages": messages, "max_tokens": max_tokens, "temperature": temperature})
        except requests.RequestException as e:
            last = str(e); time.sleep(3); continue
        if r.status_code in (429, 500, 502, 503, 504):
            last = f"{r.status_code} {r.text[:120]}"; time.sleep(5 * (attempt + 1)); continue
        if not r.ok:
            raise RuntimeError(f"{model}: HTTP {r.status_code} {r.text[:200]}")
        try:
            res = (r.json().get("result") or {})
        except ValueError:
            last = f"non-JSON response: {r.text[:120]}"; continue
        text = res.get("response") or ((res.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
        if isinstance(text, str) and text.strip():
            return text
        last = "empty response"
    raise RuntimeError(f"{model}: {last}")


def ask(messages, max_tokens, temperature=0.4):
    """Primary model, then the fallback model if the primary is unavailable (for example plan access or capacity)."""
    try:
        return cf_run(MODEL, messages, max_tokens, temperature)
    except RuntimeError as e:
        print(f"Primary model failed ({e}); trying fallback.", file=sys.stderr)
        return cf_run(FALLBACK, messages, max_tokens, temperature)


def recent_titles():
    try:
        r = requests.get(f"{API}/posts", params={"per_page": 40, "status": "publish,draft", "_fields": "title"}, timeout=30,
                         headers={"Authorization": f"Bearer {os.environ['WPCOM_TOKEN']}"} if os.environ.get("WPCOM_TOKEN") else {})
        if not r.ok:
            r = requests.get(f"{API}/posts", params={"per_page": 40, "_fields": "title"}, timeout=30)
        return [re.sub(r"<[^>]+>", "", p["title"]["rendered"]) for p in r.json()]
    except Exception:
        return []


def words(s):
    return set(re.findall(r"[a-z0-9]{4,}", s.lower()))


def pick_topic(titles):
    if os.environ.get("TOPIC"):
        return os.environ["TOPIC"]
    topics = KNOWLEDGE["topics"]
    start = datetime.date.today().toordinal() % len(topics)
    seen = [words(t) for t in titles]
    for i in range(len(topics)):
        t = topics[(start + i) % len(topics)]
        w = words(t)
        if not any(len(w & s) / max(1, len(w | s)) > 0.4 for s in seen):
            return t
    return topics[start]


def parse_draft(text):
    """Parse the labelled format (more robust than JSON for long HTML)."""
    def grab(label):
        m = re.search(rf"^{label}:\s*(.+)$", text, re.M | re.I)
        return m.group(1).strip() if m else ""
    parts = re.split(r"^-{2,}\s*HTML\s*-{2,}\s*$", text, maxsplit=1, flags=re.M | re.I)
    html = parts[1].strip() if len(parts) == 2 else ""
    return {"title": grab("TITLE"), "excerpt": grab("EXCERPT"), "cover_kicker": grab("KICKER"), "html": html}


def clean_html(html):
    html = re.sub(r"```(?:html)?", "", html)
    html = re.sub(r"<(/?)h1\b", r"<\1h2", html, flags=re.I)  # no h1 inside a post body
    def tag(m):
        return m.group(0) if m.group(2).lower() in ALLOWED_TAGS else ""
    html = re.sub(r"<(/?)([a-zA-Z0-9]+)[^>]*>", lambda m: f"<{m.group(1)}{m.group(2).lower()}>" if m.group(2).lower() in ALLOWED_TAGS else "", html)
    return html.strip()


def check_structure(post):
    problems = []
    for f in ("title", "excerpt", "cover_kicker", "html"):
        if not post[f]:
            problems.append(f"missing {f}")
    n = len(re.sub(r"<[^>]+>", " ", post["html"]).split())
    if not 450 <= n <= 1100:
        problems.append(f"{n} words (want 600-800)")
    if post["html"].count("<h2>") < 3:
        problems.append("fewer than 3 sections")
    if len(post["title"]) > 70:
        problems.append("title over 70 chars")
    return problems


def validate_text(post):
    """Same validator as the chat agent, blog mode. Returns a list of reasons (empty = clean)."""
    text = f"{post['title']}. {post['excerpt']}. {re.sub(r'<[^>]+>', ' ', post['html'])}"
    try:
        out = subprocess.run(["node", str(ROOT / "scripts/validate-draft.mjs")], input=json.dumps({"text": text, "mode": "blog"}),
                             capture_output=True, text=True, timeout=60, cwd=ROOT)
        if out.returncode != 0:
            raise RuntimeError(out.stderr[:200])
        return json.loads(out.stdout)["reasons"]
    except Exception as e:
        # Fail closed: if the validator cannot run, the post is treated as needing review.
        return [f"validator unavailable: {e}"]


def draft_post(topic, avoid):
    facts, studies = facts_block(), studies_block()
    outline = ask([
        {"role": "system", "content": f"{BRAND}\n\nFACTS:\n{facts}\n\nAPPROVED STUDIES:\n{studies}"},
        {"role": "user", "content": f"Topic: {topic}\nDo not repeat these existing titles: {json.dumps(avoid[:25])}\n"
         "Write a short outline for a 600-800 word post: a title (max 70 chars), a one-line angle, 4 or 5 section headings, and a 2-4 word cover kicker. Plain text, no preamble."},
    ], max_tokens=300, temperature=0.5)
    prompt = (f"Write the full post from this outline.\n\nOUTLINE:\n{outline}\n\n"
              "Format exactly:\nTITLE: <max 70 chars>\nEXCERPT: <max 160 chars>\nKICKER: <2-4 words shown on the cover image>\n---HTML---\n"
              "<valid HTML using only h2, p, ul, li, strong, em; no h1; 600-800 words; end with a soft invitation to talk at popupgenix.com/contact>")
    msgs = [{"role": "system", "content": f"{BRAND}\n\nFACTS:\n{facts}\n\nAPPROVED STUDIES:\n{studies}"}, {"role": "user", "content": prompt}]
    post = parse_draft(ask(msgs, max_tokens=2600))
    post["html"] = clean_html(post["html"])
    problems = check_structure(post)
    reasons = validate_text(post) if not problems else []
    if problems or reasons:
        # One repair pass, told exactly what was wrong.
        fix = "; ".join(problems + reasons)
        print(f"Draft needs repair: {fix}", file=sys.stderr)
        msgs += [{"role": "assistant", "content": f"TITLE: {post['title']}\nEXCERPT: {post['excerpt']}\nKICKER: {post['cover_kicker']}\n---HTML---\n{post['html']}"},
                 {"role": "user", "content": f"Rewrite the whole post and fix these problems: {fix}. Remove any price, client, statistic or claim that is not in the FACTS. Keep the same format."}]
        post = parse_draft(ask(msgs, max_tokens=2600, temperature=0.2))
        post["html"] = clean_html(post["html"])
        problems = check_structure(post)
        reasons = validate_text(post) if not problems else []
    post["problems"] = problems + reasons
    return post


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def background_image(title):
    """Optional text-free background (FLUX.1 [schnell], Apache 2.0). Returns a data URI or None."""
    if os.environ.get("COVER_BG") != "1":
        return None
    try:
        r = requests.post(f"{CF}/{IMAGE_MODEL}", timeout=120, headers={"Authorization": f"Bearer {os.environ['CF_API_TOKEN']}"},
            json={"prompt": "Abstract dark blue and cyan gradient light streaks, soft glow, minimal, premium technology backdrop, "
                            "no text, no letters, no logos, no people", "steps": 4})
        b64 = ((r.json() or {}).get("result") or {}).get("image")
        return f"data:image/jpeg;base64,{b64}" if r.ok and b64 else None
    except Exception as e:
        print(f"Background skipped ({e}).", file=sys.stderr)
        return None


def render_cover(title, kicker, out):
    logo = (ROOT / "public/popupgenix-logo.svg").read_text().replace("<svg ", '<svg width="110" height="110" ', 1)
    bg = background_image(title)
    layer = f"linear-gradient(rgba(10,10,11,.62),rgba(10,10,11,.8)),url({bg}) center/cover," if bg else ""
    html = f"""<html><body style="margin:0;width:1600px;height:900px;box-sizing:border-box;font-family:Inter,Helvetica,Arial,sans-serif;color:#fff;
background:{layer}radial-gradient(1100px 650px at 90% -10%,#2B45F588,transparent),radial-gradient(900px 650px at -10% 110%,#0AA4FF55,transparent),#0a0a0b;
display:flex;flex-direction:column;justify-content:center;padding:0 130px">
<div style="display:flex;align-items:center;gap:22px">{logo}<span style="font-size:44px;font-weight:700">PopupGenix</span></div>
<div style="margin-top:56px;font-size:32px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#FFC247">{esc(kicker)}</div>
<div style="margin-top:20px;font-size:92px;font-weight:800;letter-spacing:-3px;line-height:1.04;max-width:1300px">{esc(title)}</div>
<div style="position:absolute;left:130px;right:130px;bottom:70px;height:6px;border-radius:3px;background:linear-gradient(90deg,#2B45F5,#0AA4FF,transparent)"></div></body></html>"""
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1600, "height": 900})
        pg.set_content(html); pg.wait_for_timeout(300); pg.screenshot(path=str(out)); b.close()


def main():
    titles = recent_titles()
    topic = pick_topic(titles)
    print("Topic:", topic)
    try:
        post = draft_post(topic, titles)
    except RuntimeError as e:
        sys.exit(f"Drafting failed ({e}); nothing was posted.")
    if post["problems"] and (not post["title"] or not post["html"]):
        sys.exit(f"Draft unusable ({post['problems']}); nothing was posted.")

    status, title = STATUS, post["title"]
    if post["problems"]:
        status, title = "draft", f"[NEEDS REVIEW] {post['title']}"
        print("Validation flagged the draft; it will be a draft for review:", post["problems"], file=sys.stderr)

    cover = ROOT / "daily-cover.png"
    try:
        render_cover(post["title"], post["cover_kicker"] or "PopupGenix", cover)
    except Exception as e:
        sys.exit(f"Cover render failed ({e}); nothing was posted.")
    print("Drafted:", title)
    if os.environ.get("DRY_RUN"):
        (ROOT / "daily-draft.html").write_text(f"<h1>{esc(title)}</h1>\n<p><em>{esc(post['excerpt'])}</em></p>\n{post['html']}\n")
        print(post["excerpt"], "| flagged:", post["problems"] or "no")
        return
    if not os.environ.get("WPCOM_TOKEN"):
        sys.exit("WPCOM_TOKEN is required unless DRY_RUN=1.")
    h = {"Authorization": f"Bearer {os.environ['WPCOM_TOKEN']}"}
    media_id = None
    try:
        with open(cover, "rb") as f:
            m = requests.post(f"{API}/media", headers={**h, "Content-Disposition": 'attachment; filename="cover.png"', "Content-Type": "image/png"}, data=f.read(), timeout=120)
        m.raise_for_status(); media_id = m.json()["id"]
        p = requests.post(f"{API}/posts", headers=h, timeout=60, json={
            "title": title, "content": post["html"], "excerpt": post["excerpt"], "status": status, "featured_media": media_id})
        p.raise_for_status()
    except (requests.RequestException, KeyError, ValueError) as e:
        if media_id is not None:  # post failed after upload: remove the orphaned cover
            try:
                requests.delete(f"{API}/media/{media_id}", headers=h, params={"force": "true"}, timeout=30)
            except requests.RequestException:
                pass
        sys.exit(f"WordPress upload failed ({e}); nothing was posted.")
    print("WordPress post:", p.json().get("link"), "status:", status)


if __name__ == "__main__":
    sys.exit(main())
