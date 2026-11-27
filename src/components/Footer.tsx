import { Button } from "@/components/ui/button";
import {
  Mail,
  Phone,
  MapPin,
  Facebook,
  Twitter,
  Linkedin
} from "lucide-react";
import { Link } from "react-router-dom";
import PaymentLogos from "@/components/PaymentLogos";

const Footer = () => {
  const quickLinks = [
    { name: "About Us", href: "/#about" },
    { name: "Services", href: "/#services" },
    { name: "Portfolio", href: "/#portfolio" },
    { name: "Pricing", href: "/pricing" },
    { name: "Blog", href: "/blog" },
    { name: "Contact", href: "/contact" }
  ];

  const services = [
    { name: "AI & Machine Learning", href: "/#services" },
    { name: "Custom Software", href: "/#services" },
    { name: "Web Development", href: "/#services" },
    { name: "Mobile Apps", href: "/#services" },
    { name: "CRM & SaaS Tools", href: "/#services" }
  ];

  const socialLinks = [
    { icon: Facebook, href: "https://www.facebook.com/profile.php?id=61577242150254", label: "Facebook" },
    { icon: Twitter, href: "https://x.com/popupgenix7", label: "Twitter" },
    { icon: Linkedin, href: "https://www.linkedin.com/company/popupgenix", label: "LinkedIn" }
  ];

  return (
    <footer className="bg-background border-t border-border">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        {/* Main Footer Content */}
        <div className="py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12">
            {/* Company Info */}
            <div className="lg:col-span-2">
              <div className="flex items-center space-x-3 mb-6">
                <img
                  src="/lovable-uploads/840fc8c0-fd1f-46ff-b59e-8c30eeebac75.png"
                  alt="PopupGenix Logo"
                  className="h-9 w-auto"
                />
              </div>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                PopupGenix creates cutting-edge AI and software solutions that drive business growth
                and deliver exceptional user experiences through intelligent, scalable technology.
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-foreground text-sm font-medium">
                  <Mail className="w-4 h-4 text-primary" />
                  <span>hello@popupgenix.com</span>
                </div>
                <div className="flex items-center gap-3 text-foreground text-sm font-medium">
                  <Phone className="w-4 h-4 text-primary" />
                  <span>+1 479 689 1012</span>
                </div>
                <div className="flex items-center gap-3 text-foreground text-sm font-medium">
                  <MapPin className="w-4 h-4 text-primary" />
                  <span>1209 MOUNTAIN ROAD PL NE, STE R, ALBUQUERQUE, NM 87110, USA</span>
                </div>
              </div>

              {/* Payment Partners */}
              <div className="mt-8 pt-6 border-t border-border">
                <PaymentLogos variant="color" size="md" />
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] mb-6 text-foreground">Quick Links</h4>
              <ul className="space-y-3">
                {quickLinks.map((link) => (
                  <li key={link.name}>
                    <Link
                      to={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-300"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Services */}
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] mb-6 text-foreground">Services</h4>
              <ul className="space-y-3">
                {services.map((service) => (
                  <li key={service.name}>
                    <Link
                      to={service.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-300"
                    >
                      {service.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Connect & Social */}
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] mb-6 text-foreground">Connect With Us</h4>
              <div className="flex gap-3 mb-6">
                {socialLinks.map((social) => {
                  const IconComponent = social.icon;
                  return (
                    <a
                      key={social.label}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={social.label}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:border-primary/40 hover:bg-secondary transition-colors duration-300"
                    >
                      <IconComponent className="w-4 h-4 text-muted-foreground" />
                    </a>
                  );
                })}
              </div>
              <Link to="/portal">
                <Button variant="outline" size="sm" className="w-full">
                  Client Portal Login
                </Button>
              </Link>
            </div>

            {/* Legal & Trust */}
            <div className="order-last lg:order-none">
              <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] mb-6 text-foreground">Legal & Trust</h4>
              <ul className="space-y-3 mb-6">
                <li>
                  <Link to="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-300">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms-and-conditions" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-300">
                    Terms & Conditions
                  </Link>
                </li>
                <li>
                  <Link to="/refund-policy" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-300">
                    Refund Policy
                  </Link>
                </li>
                <li>
                  <Link to="/cookie-policy" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-300">
                    Cookie Policy
                  </Link>
                </li>
              </ul>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                  <span>99.99% Uptime Guaranteed</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                  <span>30-Day Refund Policy</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="py-8 border-t border-border">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm">
              © 2025 PopupGenix.com – All Rights Reserved
            </p>
            <div className="flex items-center gap-6 text-sm">
              <Link to="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
              <Link to="/terms-and-conditions" className="text-muted-foreground hover:text-foreground transition-colors">
                Terms & Conditions
              </Link>
              <Link to="/refund-policy" className="text-muted-foreground hover:text-foreground transition-colors">
                Refund Policy
              </Link>
              <Link to="/cookie-policy" className="text-muted-foreground hover:text-foreground transition-colors">
                Cookie Policy
              </Link>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-border">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
                PopupGenix is committed to secure, fair, and reliable services. By using our platform, you agree to our Privacy Policy and Terms of Use.
              </p>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Secure Payments:</span>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Stripe</span>
                  <span>|</span>
                  <span>Wise</span>
                  <span>|</span>
                  <span>Visa</span>
                  <span>|</span>
                  <span>Mastercard</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
