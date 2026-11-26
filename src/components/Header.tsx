import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { MAIN_NAV } from "@/lib/site";

const Header = () => {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition-colors ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <header
        className={`fixed inset-x-0 top-0 z-50 border-b transition-all duration-300 ${
          scrolled || open ? "border-border bg-background/85 backdrop-blur-xl" : "border-transparent bg-transparent"
        }`}
      >
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-12" aria-label="Main">
          <Link to="/" className="flex items-center gap-2.5" aria-label="PopupGenix home">
            <img src="/popupgenix-logo.svg" alt="" className="h-8 w-8" width={32} height={32} />
            <span className="text-lg font-bold tracking-tight">PopupGenix</span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {MAIN_NAV.map((item) => (
              <NavLink key={item.href} to={item.href} className={linkClass}>
                {item.name}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              to="/contact"
              className="hidden h-9 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 md:inline-flex"
            >
              Book a call
            </Link>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border md:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-nav"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </nav>

        {open && (
          <div id="mobile-nav" className="border-t border-border bg-background md:hidden">
            <div className="mx-auto flex max-w-7xl flex-col gap-1 px-6 py-6">
              {MAIN_NAV.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  className={({ isActive }) =>
                    `rounded-xl px-3 py-3 text-lg font-medium ${isActive ? "bg-secondary text-foreground" : "text-muted-foreground"}`
                  }
                >
                  {item.name}
                </NavLink>
              ))}
              <Link
                to="/contact"
                className="mt-4 inline-flex h-12 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground"
              >
                Book a call
              </Link>
            </div>
          </div>
        )}
      </header>
    </>
  );
};

export default Header;
