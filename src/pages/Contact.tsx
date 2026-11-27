import { Mail, Phone, MapPin, Clock, MessageCircle, PhoneCall, ArrowRight, Shield, Zap, Users } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

/* Contact config — single source of truth */
const CONTACT = {
  email: "popupitcompany@gmail.com",
  emailAlt: "hello@popupgenix.com",
  phone: "+1 479 689 1012",
  phoneClean: "+14796891012",
  whatsapp: "+8801838580258",
  whatsappClean: "8801838580258",
  address: "1209 MOUNTAIN ROAD PL NE, STE R, ALBUQUERQUE, NM 87110, USA",
  hours: "Mon – Fri: 9:00 AM – 6:00 PM MST",
} as const;

/* Pre-built action URLs */
const EMAIL_HREF = `mailto:${CONTACT.email}?subject=${encodeURIComponent("New Project Inquiry – PopupGenix")}&body=${encodeURIComponent("Name:\nCompany:\nBudget:\nProject Details:\n")}`;
const WA_CHAT_HREF = `https://wa.me/${CONTACT.whatsappClean}?text=${encodeURIComponent("Hello PopupGenix, I'd like to discuss a project.")}`;
const WA_CALL_HREF = `https://wa.me/${CONTACT.whatsappClean}`;

/* Trust signals */
const trustPoints = [
  { icon: Shield, text: "8+ Years Industry Experience" },
  { icon: Zap, text: "Typical Response Under 2 Hours" },
  { icon: Users, text: "50+ Projects Delivered Worldwide" },
];

const Contact = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <Header />

      <main className="pt-20">
        {/* ── Hero / CTA Section (above the fold) ── */}
        <section className="relative py-24 md:py-32 overflow-hidden" aria-labelledby="contact-heading">
          {/* Ambient glow */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-10 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[140px] animate-pulse" style={{ animationDuration: "7s" }} />
            <div className="absolute bottom-10 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: "9s", animationDelay: "2s" }} />
          </div>

          <div className="container mx-auto px-6 relative z-10 text-center max-w-3xl">
            <h1
              id="contact-heading"
              className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-6"
            >
              Let's Build Something Great Together
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground mb-4 max-w-2xl mx-auto">
              Skip the forms — reach out directly and get a response within hours, not days.
            </p>
            <p className="text-sm text-muted-foreground/70 mb-12">
              No sign-ups. No waiting. Just a real conversation about your project.
            </p>

            {/* ── CTA Buttons ── */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
              {/* Email */}
              <a
                href={EMAIL_HREF}
                aria-label="Email PopupGenix at popupitcompany@gmail.com"
                className="group relative w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-base font-semibold text-white transition-all duration-500 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:-translate-y-1 hover:scale-[1.03]"
                style={{
                  background: "linear-gradient(135deg, hsl(270,80%,55%), hsl(220,90%,55%))",
                  boxShadow: "0 0 25px rgba(138,43,226,0.4), 0 6px 20px rgba(0,0,0,0.2)",
                }}
              >
                <Mail className="w-5 h-5 shrink-0" />
                Email Us
                <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
              </a>

              {/* WhatsApp Chat */}
              <a
                href={WA_CHAT_HREF}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Chat with PopupGenix on WhatsApp"
                className="group relative w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-base font-semibold text-white transition-all duration-500 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:-translate-y-1 hover:scale-[1.03]"
                style={{
                  background: "linear-gradient(135deg, hsl(145,65%,42%), hsl(155,70%,35%))",
                  boxShadow: "0 0 25px rgba(37,211,102,0.35), 0 6px 20px rgba(0,0,0,0.2)",
                }}
              >
                <MessageCircle className="w-5 h-5 shrink-0" />
                Chat on WhatsApp
                <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
              </a>

              {/* WhatsApp Call */}
              <a
                href={WA_CALL_HREF}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Call PopupGenix on WhatsApp"
                className="group relative w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-base font-semibold text-foreground border border-border transition-all duration-500 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:-translate-y-1 hover:scale-[1.03] bg-card hover:border-green-500/50"
                style={{
                  boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                }}
              >
                <PhoneCall className="w-5 h-5 shrink-0" />
                Call on WhatsApp
              </a>
            </div>

            {/* Trust signals */}
            <div className="mt-14 flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10">
              {trustPoints.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon className="w-4 h-4 text-accent shrink-0" />
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Contact Info Cards ── */}
        <section className="py-20" aria-labelledby="contact-info-heading">
          <div className="container mx-auto px-6">
            <h2 id="contact-info-heading" className="text-2xl md:text-3xl font-bold text-center mb-12 text-foreground">
              Reach Us Directly
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {/* Phone (US — no WhatsApp) */}
              <div
                className="backdrop-blur-xl rounded-2xl border p-6 transition-all duration-500 hover:scale-[1.03]"
                style={{
                  background: "var(--glass-bg)",
                  borderColor: "var(--glass-border)",
                  boxShadow: "var(--shadow-glass)",
                }}
              >
                <div className="p-3 bg-primary/10 rounded-xl w-fit mb-4">
                  <Phone className="h-6 w-6 text-primary" aria-hidden="true" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Phone</h3>
                <a href={`tel:${CONTACT.phoneClean}`} className="text-muted-foreground hover:text-accent transition-colors text-sm block">
                  {CONTACT.phone}
                </a>
                <a href={`tel:${CONTACT.whatsapp}`} className="text-muted-foreground hover:text-accent transition-colors text-sm block mt-1">
                  {CONTACT.whatsapp} (WhatsApp)
                </a>
              </div>

              {/* Emails */}
              <div
                className="backdrop-blur-xl rounded-2xl border p-6 transition-all duration-500 hover:scale-[1.03]"
                style={{
                  background: "var(--glass-bg)",
                  borderColor: "var(--glass-border)",
                  boxShadow: "var(--shadow-glass)",
                }}
              >
                <div className="p-3 bg-accent/10 rounded-xl w-fit mb-4">
                  <Mail className="h-6 w-6 text-accent" aria-hidden="true" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Email</h3>
                <a href={`mailto:${CONTACT.emailAlt}`} className="text-muted-foreground hover:text-accent transition-colors text-sm block">
                  {CONTACT.emailAlt}
                </a>
                <a href={`mailto:${CONTACT.email}`} className="text-muted-foreground hover:text-accent transition-colors text-sm block mt-1">
                  {CONTACT.email}
                </a>
              </div>

              {/* Address */}
              <div
                className="backdrop-blur-xl rounded-2xl border p-6 transition-all duration-500 hover:scale-[1.03]"
                style={{
                  background: "var(--glass-bg)",
                  borderColor: "var(--glass-border)",
                  boxShadow: "var(--shadow-glass)",
                }}
              >
                <div className="p-3 bg-secondary/50 rounded-xl w-fit mb-4">
                  <MapPin className="h-6 w-6 text-foreground" aria-hidden="true" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Address</h3>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(CONTACT.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-accent transition-colors text-sm"
                >
                  {CONTACT.address}
                </a>
              </div>

              {/* Hours */}
              <div
                className="backdrop-blur-xl rounded-2xl border p-6 transition-all duration-500 hover:scale-[1.03]"
                style={{
                  background: "var(--glass-bg)",
                  borderColor: "var(--glass-border)",
                  boxShadow: "var(--shadow-glass)",
                }}
              >
                <div className="p-3 bg-primary/10 rounded-xl w-fit mb-4">
                  <Clock className="h-6 w-6 text-primary" aria-hidden="true" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Business Hours</h3>
                <p className="text-muted-foreground text-sm">
                  {CONTACT.hours}<br />Weekend: By appointment
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Why PopupGenix ── */}
        <section className="py-16" aria-labelledby="why-heading">
          <div className="container mx-auto px-6">
            <div
              className="backdrop-blur-xl rounded-3xl border p-10 md:p-14 max-w-4xl mx-auto text-center transition-all duration-500 hover:scale-[1.01]"
              style={{
                background: "var(--glass-bg)",
                borderColor: "var(--glass-border)",
                boxShadow: "var(--shadow-glass)",
              }}
            >
              <h2 id="why-heading" className="text-2xl md:text-3xl font-bold mb-8 text-foreground">
                Why Choose PopupGenix?
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-left max-w-2xl mx-auto">
                {[
                  { color: "bg-primary", text: "Expert team with 8+ years experience" },
                  { color: "bg-accent", text: "Custom solutions tailored to your needs" },
                  { color: "bg-primary", text: "24/7 support and maintenance" },
                  { color: "bg-accent", text: "Competitive pricing and fast delivery" },
                ].map(({ color, text }) => (
                  <li key={text} className="flex items-center text-muted-foreground">
                    <span className={`w-2 h-2 ${color} rounded-full mr-3 shrink-0`} aria-hidden="true" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Contact;
