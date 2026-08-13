import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  Globe,
  Smartphone,
  ArrowRight,
  Brain,
  Code,
  Users,
  Cloud
} from "lucide-react";

const services = [
  {
    icon: Brain,
    title: "AI & Machine Learning",
    description: "Advanced AI solutions including NLP, computer vision, predictive analytics, and AI security systems.",
    features: ["Natural Language Processing", "Computer Vision", "Predictive Analytics", "AI Security"],
    learnMore: "At PopupGenix, we harness the power of Artificial Intelligence and Machine Learning to transform businesses into smarter, data-driven enterprises. Our solutions include Natural Language Processing (NLP) for understanding and analyzing text, Computer Vision for image and video recognition, and Predictive Analytics for accurate forecasting and decision-making. Additionally, our AI Security Systems safeguard your infrastructure and sensitive data from cyber threats. By integrating AI into your workflows, we enable automation, improve operational efficiency, and uncover insights that drive innovation and competitive advantage."
  },
  {
    icon: Code,
    title: "Custom Software Development",
    description: "Bespoke enterprise solutions including ERP, CRM, SaaS platforms, and business automation tools.",
    features: ["ERP Systems", "CRM Solutions", "SaaS Platforms", "Business Automation"],
    learnMore: "Every business has unique processes, challenges, and goals—your software should reflect that. PopupGenix specializes in building custom ERP systems, CRM solutions, SaaS platforms, and business automation tools tailored to your exact requirements. Our team ensures that every solution integrates seamlessly with your existing operations, optimizes workflows, and provides real-time insights. Whether you need scalable enterprise applications or specialized tools for niche processes, our bespoke software increases productivity, reduces manual work, and accelerates growth."
  },
  {
    icon: Globe,
    title: "Web Development",
    description: "Modern web applications from corporate websites to e-commerce platforms and progressive web apps.",
    features: ["Corporate Websites", "E-commerce Platforms", "Content Management", "Progressive Web Apps"],
    learnMore: "We design and develop modern, high-performance web applications that are both visually appealing and technically robust. From corporate websites that build brand credibility to e-commerce platforms that drive sales, Content Management Systems (CMS) for easy website management, and Progressive Web Apps (PWAs) for a seamless mobile experience, PopupGenix delivers solutions that scale with your business. Our development approach ensures fast loading times, responsive designs, enhanced security, and integration with advanced analytics and marketing tools."
  },
  {
    icon: Smartphone,
    title: "Mobile Apps",
    description: "Native and cross-platform mobile applications powered by AI for iOS, Android, and hybrid platforms.",
    features: ["iOS Development", "Android Development", "Cross-platform", "AI-powered Apps"],
    learnMore: "PopupGenix creates native and cross-platform mobile applications designed to engage users and elevate business performance. Our mobile solutions span iOS and Android development, hybrid apps, and AI-powered applications that deliver personalized experiences. We focus on intuitive design, high performance, and seamless integration with backend systems. By leveraging AI within mobile apps, we help businesses enhance user engagement, provide smarter interactions, and gain actionable insights from user behavior—all while maintaining high security and scalability."
  },
  {
    icon: Users,
    title: "CRM & SaaS Tools",
    description: "Intelligent CRM systems and SaaS tools with sales automation and AI-driven analytics dashboards.",
    features: ["Sales Automation", "AI Dashboards", "Customer Analytics", "Lead Management"],
    learnMore: "Efficiently manage your sales, leads, and customer relationships with our intelligent CRM systems and SaaS tools. PopupGenix integrates AI-powered dashboards, predictive analytics, sales automation, and customer insights to help businesses make informed decisions and optimize performance. Our platforms enable real-time tracking of customer interactions, streamline lead management, automate repetitive tasks, and enhance team collaboration. Whether you are a startup or enterprise, our solutions empower you to increase conversions, improve customer satisfaction, and grow your business intelligently."
  },
  {
    icon: Cloud,
    title: "Cloud & DevOps",
    description: "Cloud migration services, CI/CD pipelines, Kubernetes orchestration, and scalable infrastructure.",
    features: ["Cloud Migration", "CI/CD Pipelines", "Kubernetes", "Infrastructure Scaling"],
    learnMore: "Our Cloud & DevOps services help businesses achieve resilience, scalability, and operational efficiency. PopupGenix provides cloud migration, CI/CD pipeline automation, Kubernetes orchestration, and infrastructure scaling to ensure seamless performance and minimal downtime. By automating deployments and optimizing cloud architecture, we reduce operational costs, enhance application stability, and accelerate development cycles. Our solutions are designed to handle high-traffic workloads, ensure business continuity, and provide the flexibility your enterprise needs to grow securely in the digital age."
  }
];

const Services = () => {
  return (
    <section id="services" className="py-24 md:py-32 bg-secondary/30">
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
            Our Services
          </div>

          <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-6 text-foreground">
            Our Core Services
          </h2>

          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            We deliver comprehensive AI and software solutions that drive innovation,
            enhance efficiency, and accelerate your business growth in the digital age.
          </p>
        </motion.div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((service, index) => {
            const IconComponent = service.icon;

            return (
              <motion.div
                key={service.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="group relative p-8 rounded-3xl border border-border bg-card transition-colors duration-300 hover:border-primary/30 dark:border-white/5 dark:bg-white/[0.02]"
              >
                <div className="inline-flex p-4 rounded-2xl bg-primary/10 mb-6">
                  <IconComponent className="w-7 h-7 text-primary" />
                </div>

                <h3 className="text-xl font-bold mb-3 text-foreground">
                  {service.title}
                </h3>

                <p className="text-muted-foreground mb-6 leading-relaxed text-sm">
                  {service.description}
                </p>

                <ul className="space-y-2.5 mb-8">
                  {service.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="w-1 h-1 rounded-full bg-primary flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Dialog>
                  <DialogTrigger asChild>
                    <button className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-foreground group/btn">
                      Learn More
                      <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover/btn:translate-x-1" />
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto rounded-3xl border border-border">
                    <DialogHeader>
                      <DialogTitle className="flex items-center text-2xl font-bold">
                        <IconComponent className="w-6 h-6 mr-3 text-primary" />
                        {service.title}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <p className="text-muted-foreground leading-relaxed">
                        {service.learnMore}
                      </p>
                      <div>
                        <h4 className="font-semibold mb-2 text-sm">Key Features:</h4>
                        <div className="flex flex-wrap gap-2">
                          {service.features.map((feature) => (
                            <Badge key={feature} variant="default">
                              {feature}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="pt-4 border-t border-border">
                        <Link to="/contact">
                          <Button className="w-full">
                            Get a Quote for {service.title}
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Services;
