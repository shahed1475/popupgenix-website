import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const HEADER_OFFSET = 72;

// Scroll to a position and make sure we really get there. Waits while the
// mobile menu still locks the page, then re-checks twice in case the browser
// was busy or the layout moved. Stops if the visitor scrolls on their own.
export function scrollToTarget(getTop: () => number | null, smooth = true) {
  let userMoved = false;
  const stop = () => { userMoved = true; };
  const opts = { passive: true } as AddEventListenerOptions;
  window.addEventListener("wheel", stop, opts);
  window.addEventListener("touchstart", stop, opts);
  window.addEventListener("keydown", stop);
  const cleanup = () => {
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchstart", stop);
    window.removeEventListener("keydown", stop);
  };

  let tries = 0;
  const go = () => {
    const top = getTop();
    if (top === null || document.body.style.overflow === "hidden") {
      if (tries++ < 80) return void setTimeout(go, 50);
      cleanup();
      return;
    }
    window.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
    const check = (last: boolean) => () => {
      if (userMoved) return last && cleanup();
      const again = getTop();
      if (again !== null && Math.abs(again - window.scrollY) > 24) window.scrollTo({ top: again, behavior: "auto" });
      if (last) cleanup();
    };
    setTimeout(check(false), smooth ? 1000 : 350);
    setTimeout(check(true), 2200);
  };
  setTimeout(go, 0);
}

export function scrollToSection(id: string, smooth = true) {
  scrollToTarget(() => {
    const el = document.getElementById(id);
    return el ? Math.max(0, el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET) : null;
  }, smooth);
}

export function scrollToTop() {
  scrollToTarget(() => 0, true);
}

// Scrolls to "#section" links on every click (location.key), so tapping
// "About" twice still works. Smooth on the same page, instant from another page.
const ScrollToHash = () => {
  const location = useLocation();
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    const samePage = prevPath.current === location.pathname;
    prevPath.current = location.pathname;
    if (location.hash) {
      scrollToSection(decodeURIComponent(location.hash.slice(1)), samePage);
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [location.pathname, location.hash, location.key]);

  return null;
};

export default ScrollToHash;
