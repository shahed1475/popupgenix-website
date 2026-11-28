import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { m } from "framer-motion";
import { ExternalLink, ArrowRight, Lock } from "lucide-react";

/* Short, brand-matching link for HOM (our lead-finding product). */
const HOM_URL = "https://autolead-manager.pages.dev/";

type Project = {
  title: string;
  category: string;
  description: string;
  image: string;
  tags: string[];
  link?: string;
  status?: string; // when set, the project is locked (no link)
};

const projects: Project[] = [
  {
    title: "Clarify AI",
    category: "AI Platform",
    description: "Turns messy data into clear answers, so your team can see what is happening and what to do next.",
    image: "/portfolio/clarify.png",
    tags: ["AI/ML", "Data Analytics", "Python", "React"],
    link: "https://www.clarify.ai/",
  },
  {
    title: "Klevere AI",
    category: "SaaS Platform",
    description: "A smart reporting tool for business teams. It spots trends, predicts what may happen, and builds reports for you.",
    image: "/portfolio/klevere.png",
    tags: ["AI", "Business Intelligence", "SaaS", "Analytics"],
    link: "https://www.klevere.ai/",
  },
  {
    title: "BlackGPT",
    category: "AI Chatbot",
    description: "An AI chat assistant that answers questions from your own knowledge base, in simple and clear language.",
    image: "/portfolio/blackgpt.png",
    tags: ["AI", "NLP", "Chatbot", "Machine Learning"],
    link: "https://blackgpt.us/",
  },
  {
    title: "Inno AI",
    category: "Compliance Platform",
    description: "Checks food ingredients against EU and US additive rules and suggests safer swaps. We are still building it.",
    image: "/portfolio/inno.webp",
    tags: ["TypeScript", "Cloudflare Workers", "D1", "SQLite"],
    status: "In development",
  },
  {
    title: "HOM",
    category: "Lead Generation",
    description: "Finds the right businesses, researches who makes the decisions, and writes personal emails for you to approve.",
    image: "/portfolio/hom.webp",
    tags: ["AI", "Lead Gen", "Outreach", "React"],
    link: HOM_URL,
  },
];

const Portfolio = () => {
  return (
    <section id="portfolio" className="py-24 md:py-32">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        {/* Section Header */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.35em] text-muted-foreground mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Our Work
          </div>

          <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-6 text-foreground">
            Products We Have Built
          </h2>

          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            A few of the AI and software products we have designed and built.
            Each one solves a real business problem.
          </p>
        </m.div>

        {/* Portfolio Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-16 max-w-5xl mx-auto">
          {projects.map((project, index) => (
            <m.div
              key={project.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`group relative rounded-3xl border border-border bg-card overflow-hidden dark:border-white/5 dark:bg-white/[0.02] ${
                index === projects.length - 1 && projects.length % 2 === 1 ? "md:col-span-2 md:w-[calc(50%-0.5rem)] md:justify-self-center" : ""
              }`}
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-secondary">
                <img
                  src={project.image}
                  alt={`${project.title} product screenshot`}
                  width={1600}
                  height={1000}
                  className={`w-full h-full object-cover transition-transform duration-700 ${project.link ? "group-hover:scale-105" : "opacity-80"}`}
                  loading="lazy"
                  decoding="async"
                />
                {project.status && (
                  <span className="absolute top-4 left-4 inline-flex items-center gap-2 rounded-full bg-background/90 backdrop-blur border border-border px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-foreground">
                    <Lock className="w-3 h-3" aria-hidden="true" />
                    {project.status}
                  </span>
                )}
                {project.link && (
                  <a
                    href={project.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${project.title}`}
                    className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-background/90 backdrop-blur border border-border opacity-0 translate-y-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0 focus-visible:opacity-100"
                  >
                    <ExternalLink className="w-4 h-4 text-foreground" />
                  </a>
                )}
              </div>

              <div className="p-6">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent mb-2">
                  {project.category}
                </div>
                <h3 className="text-xl font-bold mb-3 text-foreground">
                  {project.title}
                </h3>
                <p className="text-muted-foreground mb-5 leading-relaxed text-sm">
                  {project.description}
                </p>

                <div className="flex flex-wrap gap-2 mb-6">
                  {project.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 text-xs rounded-full border border-border text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {project.link ? (
                  <a
                    href={project.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-foreground group/btn"
                  >
                    View {project.title}
                    <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover/btn:translate-x-1" />
                  </a>
                ) : (
                  <span
                    aria-disabled="true"
                    className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground cursor-not-allowed"
                  >
                    <Lock className="w-4 h-4" aria-hidden="true" />
                    Coming soon
                  </span>
                )}
              </div>
            </m.div>
          ))}
        </div>

        {/* CTA */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center rounded-3xl border border-border bg-card p-12 md:p-16 max-w-4xl mx-auto dark:border-white/5 dark:bg-white/[0.02]"
        >
          <h3 className="text-3xl md:text-4xl font-black tracking-tighter mb-4 text-foreground">
            Have an Idea? Let's Build It.
          </h3>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Tell us what you need. We will reply with clear next steps and a fair quote.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/contact">
              <Button variant="hero" size="lg">
                Start Your Project
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link to="/contact">
              <Button variant="outline" size="lg">
                Talk to Our Team
              </Button>
            </Link>
          </div>
        </m.div>
      </div>
    </section>
  );
};

export default Portfolio;
