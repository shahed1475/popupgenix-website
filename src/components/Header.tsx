import { useEffect, useState } from "react";
import { Menu, X, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ThemeToggle from "@/components/ThemeToggle";

const navigationBefore = [
  { name: "Home", href: "/" },
  { name: "About", href: "/#about" },
  { name: "Portfolio", href: "/#portfolio" },
];

const navigationAfter = [{ name: "Contact", href: "/contact" }];
const navigationEnd = [{ name: "Blog", href: "/blog" }];

const serviceItems = [
  { name: "AI & Machine Learning", href: "/services/ai-machine-learning" },
  { name: "Custom Software Development", href: "/services/custom-software" },
  { name: "Web Development", href: "/services/web-development" },
  { name: "Mobile Apps", href: "/services/mobile-apps" },
  { name: "CRM & SaaS Tools", href: "/services/crm-saas" },
  { name: "Cloud & DevOps", href: "/services/cloud-devops" },
];

const legalItems = [
  { name: "Terms & Conditions", href: "/terms-and-conditions" },
  { name: "Privacy Policy", href: "/privacy-policy" },
  { name: "Refund Policy", href: "/refund-policy" },
];

const NAV_LINK_CLASS =
  "relative text-xs font-bold uppercase tracking-[0.15em] text-foreground/70 transition-colors duration-300 hover:text-foreground py-2";

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen]);

  const NavLink = ({ name, href }: { name: string; href: string }) => (
    <Link
      to={href}
      className={NAV_LINK_CLASS}
      onMouseEnter={() => setHovered(name)}
      onMouseLeave={() => setHovered(null)}
    >
      {name}
      {hovered === name && (
        <motion.span
          layoutId="nav-underline"
          className="absolute -bottom-0.5 left-0 right-0 h-px bg-primary"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
    </Link>
  );

  return (
    <>
      <header
        className={`fixed top-0 w-full z-50 transition-all duration-300 border-b ${
          scrolled
            ? "bg-background/80 backdrop-blur-xl border-border"
            : "bg-transparent border-transparent"
        }`}
      >
        <nav className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-3">
              <img
                src="/popupgenix-logo.svg"
                alt="PopupGenix Logo"
                className="h-9 w-auto"
              />
              <span className="text-lg font-black tracking-tight text-foreground">
                PopupGenix
              </span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-9">
              {navigationBefore.map((item) => (
                <NavLink key={item.name} {...item} />
              ))}

              {/* Services Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={`${NAV_LINK_CLASS} group flex items-center gap-1 outline-none`}
                  onMouseEnter={() => setHovered("Services")}
                  onMouseLeave={() => setHovered(null)}
                >
                  <span>Services</span>
                  <ChevronDown className="w-3.5 h-3.5 transition-transform duration-300 group-data-[state=open]:rotate-180" />
                  {hovered === "Services" && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute -bottom-0.5 left-0 right-0 h-px bg-primary"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent className="border border-border min-w-[260px] bg-popover rounded-2xl p-2 shadow-elegant">
                  {serviceItems.map((item) => (
                    <DropdownMenuItem key={item.name} asChild className="cursor-pointer rounded-xl p-0">
                      <Link
                        to={item.href}
                        className="flex items-center px-4 py-3 text-sm text-foreground rounded-xl hover:bg-secondary transition-colors"
                      >
                        {item.name}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {navigationAfter.map((item) => (
                <NavLink key={item.name} {...item} />
              ))}

              {/* Legal Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={`${NAV_LINK_CLASS} group flex items-center gap-1 outline-none`}
                  onMouseEnter={() => setHovered("Legal")}
                  onMouseLeave={() => setHovered(null)}
                >
                  <span>Legal</span>
                  <ChevronDown className="w-3.5 h-3.5 transition-transform duration-300 group-data-[state=open]:rotate-180" />
                  {hovered === "Legal" && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute -bottom-0.5 left-0 right-0 h-px bg-primary"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent className="border border-border min-w-[220px] bg-popover rounded-2xl p-2 shadow-elegant">
                  {legalItems.map((item) => (
                    <DropdownMenuItem key={item.name} asChild className="cursor-pointer rounded-xl p-0">
                      <Link
                        to={item.href}
                        className="flex items-center px-4 py-3 text-sm text-foreground rounded-xl hover:bg-secondary transition-colors"
                      >
                        {item.name}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {navigationEnd.map((item) => (
                <NavLink key={item.name} {...item} />
              ))}
            </div>

            {/* Theme Toggle */}
            <div className="hidden md:flex items-center">
              <ThemeToggle />
            </div>

            {/* Mobile: theme toggle + menu button */}
            <div className="md:hidden flex items-center space-x-2">
              <ThemeToggle />
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-secondary"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                aria-label="Toggle menu"
                aria-expanded={isMenuOpen}
                type="button"
              >
                {isMenuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
          </div>
        </nav>
      </header>

      {/* Mobile Navigation - Full-screen takeover */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[100] md:hidden bg-background"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
          >
            <div className="flex items-center justify-between h-20 px-6">
              <Link to="/" onClick={() => setIsMenuOpen(false)} className="text-lg font-black tracking-tight text-foreground">
                PopupGenix
              </Link>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground hover:bg-secondary transition-colors"
                aria-label="Close menu"
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col h-[calc(100%-5rem)] overflow-y-auto px-6 pb-10">
              <div className="flex flex-col gap-1 pt-6">
                {navigationBefore.map((item, i) => (
                  <motion.div
                    key={item.name}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Link
                      to={item.href}
                      className="block py-3 text-3xl font-bold tracking-tight text-foreground"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {item.name}
                    </Link>
                  </motion.div>
                ))}

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="pt-4"
                >
                  <div className="py-2 text-[11px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
                    Services
                  </div>
                  <div className="flex flex-col gap-1">
                    {serviceItems.map((item) => (
                      <Link
                        key={item.name}
                        to={item.href}
                        className="block py-2 text-lg font-medium text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        {item.name}
                      </Link>
                    ))}
                  </div>
                </motion.div>

                {navigationAfter.map((item, i) => (
                  <motion.div
                    key={item.name}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="pt-4"
                  >
                    <Link
                      to={item.href}
                      className="block py-3 text-3xl font-bold tracking-tight text-foreground"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {item.name}
                    </Link>
                  </motion.div>
                ))}

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="pt-4"
                >
                  <div className="py-2 text-[11px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
                    Legal
                  </div>
                  <div className="flex flex-col gap-1">
                    {legalItems.map((item) => (
                      <Link
                        key={item.name}
                        to={item.href}
                        className="block py-2 text-lg font-medium text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        {item.name}
                      </Link>
                    ))}
                  </div>
                </motion.div>

                {navigationEnd.map((item, i) => (
                  <motion.div
                    key={item.name}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 + i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="pt-4"
                  >
                    <Link
                      to={item.href}
                      className="block py-3 text-3xl font-bold tracking-tight text-foreground"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {item.name}
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Header;
