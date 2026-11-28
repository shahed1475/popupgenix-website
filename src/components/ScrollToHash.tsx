import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

// Scrolls to "#section" links reliably, also on phones: it waits until the
// section exists and the mobile menu has released the page scroll, then
// scrolls with room for the fixed header. Runs on every click (location.key),
// so tapping "About" twice still works.
export function scrollToSection(id: string, smooth = true) {
  let tries = 0;
  const targetTop = () => {
    const el = document.getElementById(id);
    return el ? Math.max(0, el.getBoundingClientRect().top + window.scrollY - 72) : null;
  };
  const attempt = () => {
    const top = targetTop();
    const locked = document.body.style.overflow === "hidden";
    if (top !== null && !locked) {
      window.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
      // Images and fonts can still move the section a little after the first
      // jump. Check once more and correct, unless the visitor already scrolled.
      setTimeout(() => {
        const again = targetTop();
        if (again === null) return;
        const settled = Math.abs(window.scrollY - top) < 8;
        if (settled && Math.abs(again - window.scrollY) > 24) window.scrollTo({ top: again, behavior: "auto" });
        else if (!settled && Math.abs(window.scrollY) < 4 && again > 40) window.scrollTo({ top: again, behavior: "auto" });
      }, smooth ? 900 : 350);
      return;
    }
    if (tries++ < 60) setTimeout(attempt, 50);
  };
  setTimeout(attempt, 0);
}

const ScrollToHash = () => {
  const location = useLocation();
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    const samePage = prevPath.current === location.pathname;
    prevPath.current = location.pathname;
    if (location.hash) {
      // Smooth on the same page; an instant jump when arriving from another page.
      scrollToSection(decodeURIComponent(location.hash.slice(1)), samePage);
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [location.pathname, location.hash, location.key]);

  return null;
};

export default ScrollToHash;
