import { Mail, MessageCircle, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

interface ContactSectionProps {
  title?: string;
  subtitle?: string;
  showContactInfo?: boolean;
  className?: string;
}

const EMAIL_HREF = `mailto:popupitcompany@gmail.com?subject=${encodeURIComponent("New Project Inquiry – PopupGenix")}&body=${encodeURIComponent("Name:\nCompany:\nBudget:\nProject Details:\n")}`;
const WA_CHAT_HREF = `https://wa.me/8801838580258?text=${encodeURIComponent("Hello PopupGenix, I'd like to discuss a project.")}`;

const ContactSection = ({
  title = "Get In Touch",
  subtitle = "Ready to start your next project? Contact us today!",
  className = "",
}: ContactSectionProps) => {
  return (
    <section className={`py-24 md:py-32 bg-secondary/30 ${className}`}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-7xl mx-auto px-6 lg:px-12 text-center"
      >
        <h2 className="text-3xl md:text-5xl font-black tracking-tighter mb-4 text-foreground">{title}</h2>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">{subtitle}</p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href={EMAIL_HREF}
            aria-label="Email PopupGenix"
            className="group inline-flex items-center gap-3 px-8 py-4 rounded-full text-sm font-bold uppercase tracking-wide bg-foreground text-background transition-opacity duration-300 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Mail className="w-4 h-4 shrink-0" />
            Email Us
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
          </a>

          <a
            href={WA_CHAT_HREF}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat with PopupGenix on WhatsApp"
            className="group inline-flex items-center gap-3 px-8 py-4 rounded-full text-sm font-bold uppercase tracking-wide bg-background border border-foreground/20 text-foreground transition-colors duration-300 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <MessageCircle className="w-4 h-4 shrink-0" />
            Chat on WhatsApp
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
          </a>
        </div>
      </motion.div>
    </section>
  );
};

export default ContactSection;
