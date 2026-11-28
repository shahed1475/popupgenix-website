import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Scrolls to "#section" links reliably, also on phones: it waits until the
// section exists and the mobile menu has released the page scroll, then
// scrolls with room for the fixed header. Runs on every click (location.key),
// so tapping "About" twice still works.
export function scrollToSection(id: string, smooth = true) {
  let tries = 0;
  const attempt = () => {
    const el = document.getElementById(id);
    const locked = document.body.style.overflow === "hidden";
    if (el && !locked) {
      const top = el.getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
      return;
    }
    if (tries++ < 60) setTimeout(attempt, 50);
  };
  requestAnimationFrame(attempt);
}

const ScrollToHash = () => {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      scrollToSection(decodeURIComponent(location.hash.slice(1)));
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [location.pathname, location.hash, location.key]);

  return null;
};

export default ScrollToHash;
