"""Render branded cover images (1600x1000) for portfolio cards and blog fallbacks.
Usage: python3 scripts/make-covers.py   (needs playwright + Chrome)"""
import pathlib
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
hom = (root / "brand/hom-mark.svg").read_text()
pg_logo = (root / "public/popupgenix-logo.svg").read_text()

def mark_flux():  # FluxPOS: original geometric mark (stacked flow bars on a tile)
    return '<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#0E7C66"/><rect x="14" y="16" width="36" height="8" rx="4" fill="#fff"/><rect x="14" y="28" width="26" height="8" rx="4" fill="#fff" opacity=".85"/><rect x="14" y="40" width="32" height="8" rx="4" fill="#FFC247"/></svg>'
def mark_inno():
    return '<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#7C3AED"/><path d="M32 12l5 15 15 5-15 5-5 15-5-15-15-5 15-5z" fill="#fff"/></svg>'
def mark_sales():
    return '<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#2B45F5"/><path d="M16 22a8 8 0 0 1 8-8h16a8 8 0 0 1 8 8v10a8 8 0 0 1-8 8H30l-9 8v-8h-1a4 4 0 0 1-4-4z" fill="#fff"/><path d="M32 19l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#FFC247"/></svg>'

def mark_letter(ch,c):
    return f'<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="{c}"/><text x="32" y="45" text-anchor="middle" font-family="Inter,Arial" font-weight="800" font-size="38" fill="#fff">{ch}</text></svg>'

covers = {
 "portfolio/clarify": (mark_letter("C","#0EA5E9"), "Clarify AI", "AI-powered data analysis", "Complex datasets · actionable insight", "#0EA5E9", "#2B45F5"),
 "portfolio/klevere": (mark_letter("K","#14B8A6"), "Klevere AI", "Business intelligence platform", "Predictive analytics · automated reporting", "#14B8A6", "#2B45F5"),
 "portfolio/blackgpt": (mark_letter("B","#E8714F"), "BlackGPT", "Specialised AI chatbot", "Knowledge base · natural language", "#E8714F", "#7C3AED"),
 "portfolio/autolead": (hom, "HOM", "Sales growth engine", "Lead discovery · campaigns · pipeline", "#2F6A51", "#4A8C6D"),
 "portfolio/fluxpos": (mark_flux(), "FluxPOS", "Multi-tenant POS & commerce SaaS", "Orders · inventory · multivendor", "#0E7C66", "#2B45F5"),
 "portfolio/inno-ai": (mark_inno(), "Inno AI", "Food additive compliance", "EU & US rules · Under development", "#7C3AED", "#2B45F5"),
 "portfolio/ai-sales-employee": (mark_sales(), "AI Sales Employee", "Voice sales agent platform", "Multi-tenant · knowledge base · CRM", "#2B45F5", "#0AA4FF"),
 "blog-cover": (pg_logo, "PopupGenix", "Insights on AI, software & automation", "popupgenix.com/blog", "#2B45F5", "#0AA4FF"),
}
tpl = """<html><body style="margin:0;width:1600px;height:1000px;box-sizing:border-box;font-family:Inter,Helvetica,Arial,sans-serif;color:#fff;
background:radial-gradient(1100px 700px at 90% -10%,{a}88,transparent),radial-gradient(900px 700px at -10% 110%,{b}55,transparent),#0a0a0b;
display:flex;flex-direction:column;justify-content:center;padding:0 140px">
<div style="width:200px;height:200px;filter:drop-shadow(0 30px 60px {a}66)">{mark}</div>
<div style="margin-top:70px;font-size:128px;font-weight:800;letter-spacing:-4px;line-height:1">{name}</div>
<div style="margin-top:28px;font-size:52px;font-weight:600;color:#dfe5ff">{sub}</div>
<div style="margin-top:22px;font-size:34px;color:#8f9bc4">{meta}</div>
<div style="position:absolute;left:140px;right:140px;bottom:80px;height:6px;border-radius:3px;background:linear-gradient(90deg,{a},{b},transparent)"></div>
</body></html>"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    pg = b.new_page(viewport={"width":1600,"height":1000})
    for path,(mark,name,sub,meta,a,bb) in covers.items():
        mark = mark.replace("<svg ", '<svg width="200" height="200" ', 1)
        pg.set_content(tpl.format(mark=mark,name=name,sub=sub,meta=meta,a=a,b=bb)); pg.wait_for_timeout(200)
        out = root / "public" / (path + ".png"); out.parent.mkdir(exist_ok=True, parents=True)
        pg.screenshot(path=str(out)); print("wrote", out)
    b.close()
