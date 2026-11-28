import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

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

// Remembers where you were on every page and puts you back there on Back and
// Forward. New pages open at the top, "#section" links scroll to the section.
const positions = new Map<string, number>();
let lastKey = "default";

const ScrollToHash = () => {
  const location = useLocation();
  const navType = useNavigationType();
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    // We restore scroll ourselves; the browser's own restore fights lazy pages.
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    const save = () => positions.set(lastKey, window.scrollY);
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("scroll", save);
      window.removeEventListener("pagehide", save);
    };
  }, []);

  useEffect(() => {
    const samePage = prevPath.current === location.pathname;
    prevPath.current = location.pathname;
    lastKey = location.key;

    if (navType === "POP" && !location.hash) {
      const y = positions.get(location.key) ?? 0;
      // The page may still be growing (images, lazy content): keep trying briefly.
      let tries = 0;
      const restore = () => {
        window.scrollTo({ top: y, behavior: "auto" });
        if (Math.abs(window.scrollY - y) > 4 && tries++ < 20) setTimeout(restore, 50);
      };
      restore();
      return;
    }
    if (location.hash) {
      scrollToSection(decodeURIComponent(location.hash.slice(1)), samePage);
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [location.pathname, location.hash, location.key, navType]);

  return null;
};

export default ScrollToHash;
