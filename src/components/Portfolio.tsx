import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ExternalLink, ArrowRight } from "lucide-react";

const projects = [
  {
    title: "Clarify AI",
    category: "AI Platform",
    description: "Advanced AI-powered data analysis platform that transforms complex datasets into actionable insights.",
    image: "/portfolio/clarify.png",
    tags: ["AI/ML", "Data Analytics", "Python", "React"],
    link: "https://www.clarify.ai/"
  },
  {
    title: "Klevere AI",
    category: "SaaS Platform",
    description: "Business intelligence platform leveraging AI for predictive analytics and automated reporting.",
    image: "/portfolio/klevere.png",
    tags: ["AI", "Business Intelligence", "SaaS", "Analytics"],
    link: "https://www.klevere.ai/"
  },
  {
    title: "BlackGPT",
    category: "AI Chatbot",
    description: "Advanced conversational AI chatbot with specialized knowledge base and natural language understanding.",
    image: "/portfolio/blackgpt.png",
    tags: ["AI", "NLP", "Chatbot", "Machine Learning"],
    link: "https://blackgpt.us/"
  },
  {
    title: "Inno AI",
    category: "Business AI",
    description: "Comprehensive AI suite for business automation, from customer service to process optimization.",
    image: "/portfolio/inno.jpg",
    tags: ["AI", "Automation", "Business", "Enterprise"],
    link: "https://inno-ai-main-qk95hz.laravel.cloud/"
  }
];

const Portfolio = () => {
  return (
    <section id="portfolio" className="py-24 md:py-32">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        {/* Section Header */}
        <motion.div
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
            Portfolio Showcase
          </h2>

          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            Discover how we've transformed businesses across industries with our
            innovative AI and software solutions that deliver measurable results.
          </p>
        </motion.div>

        {/* Portfolio Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-16 max-w-5xl mx-auto">
          {projects.map((project, index) => (
            <motion.div
              key={project.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group relative rounded-3xl border border-border bg-card overflow-hidden dark:border-white/5 dark:bg-white/[0.02]"
            >
              <div className="relative h-56 overflow-hidden">
                <img
                  src={project.image}
                  alt={project.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  loading="lazy"
                />
                <a
                  href={project.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${project.title}`}
                  className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-background/90 backdrop-blur border border-border opacity-0 translate-y-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0"
                >
                  <ExternalLink className="w-4 h-4 text-foreground" />
                </a>
              </div>

              <div className="p-6">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary mb-2">
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

                <a
                  href={project.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-foreground group/btn"
                >
                  View the Project
                  <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover/btn:translate-x-1" />
                </a>
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center rounded-3xl border border-border bg-card p-12 md:p-16 max-w-4xl mx-auto dark:border-white/5 dark:bg-white/[0.02]"
        >
          <h3 className="text-3xl md:text-4xl font-black tracking-tighter mb-4 text-foreground">
            Ready to Join Our Success Stories?
          </h3>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Let's create the next breakthrough solution together. Our proven track record
            speaks for itself – now let's write your success story.
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
                Schedule Consultation
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Portfolio;
