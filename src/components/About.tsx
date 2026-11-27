import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Target,
  Eye,
  Heart,
  Shield,
  TrendingUp,
  Sparkles,
  Users,
  Award,
  Globe,
  ArrowRight
} from "lucide-react";

const values = [
  {
    icon: Sparkles,
    title: "Innovation",
    description: "Pushing boundaries with cutting-edge AI and emerging technologies"
  },
  {
    icon: Shield,
    title: "Security",
    description: "Building robust, secure solutions that protect and empower businesses"
  },
  {
    icon: TrendingUp,
    title: "Growth",
    description: "Delivering scalable solutions that drive sustainable business growth"
  },
  {
    icon: Heart,
    title: "Trust",
    description: "Building lasting partnerships through transparency and reliability"
  },
  {
    icon: Award,
    title: "Scalability",
    description: "Creating future-proof solutions that grow with your business needs"
  }
];

const stats = [
  { number: "50+", label: "Projects Delivered", icon: Target },
  { number: "25+", label: "Global Clients", icon: Globe },
  { number: "5+", label: "Years Experience", icon: Award },
  { number: "100%", label: "Client Satisfaction", icon: Users }
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const About = () => {
  return (
    <section id="about" className="py-24 md:py-32">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        {/* Who We Are */}
        <div className="max-w-4xl mx-auto text-center mb-20">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.35em] text-muted-foreground mb-6"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            About PopupGenix
          </motion.div>

          <motion.h2
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl font-black tracking-tighter mb-12 text-foreground"
          >
            Who We Are
          </motion.h2>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="rounded-3xl border border-border bg-card p-8 md:p-12 mb-12 text-left space-y-6 dark:border-white/5 dark:bg-white/[0.02]"
          >
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
              PopupGenix is a custom software and AI solutions company helping businesses of all sizes
              transform their ideas into powerful digital products. We design and build everything from
              websites and mobile apps to advanced AI-driven platforms. Our team focuses on creating
              scalable, secure, and user-friendly solutions that are designed to grow with your business.
            </p>

            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
              We provide complete enterprise software such as <span className="text-foreground font-semibold">CRM systems</span> (Customer
              Relationship Management) that help companies manage customer interactions, and <span className="text-foreground font-semibold">ERP
              systems</span> (Enterprise Resource Planning) that streamline operations like sales, HR, finance,
              and inventory management.
            </p>

            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
              In addition, we deliver modern <span className="text-foreground font-semibold">SaaS platforms</span>, responsive web applications,
              and intelligent <span className="text-foreground font-semibold">AI/ML solutions</span> such as predictive analytics, automation,
              and computer vision. Our mission is simple: to help businesses innovate faster, reduce costs,
              and serve their customers better with the power of technology.
            </p>
          </motion.div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
            {stats.map((stat, index) => {
              const IconComponent = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="text-center rounded-2xl border border-border bg-card p-6 dark:border-white/5 dark:bg-white/[0.02]"
                >
                  <div className="inline-flex p-3 rounded-xl bg-primary/10 mb-3">
                    <IconComponent className="w-5 h-5 text-primary" />
                  </div>
                  <div className="text-2xl md:text-3xl font-black tracking-tight text-foreground mb-1">{stat.number}</div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{stat.label}</div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Mission & Vision */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-20">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            transition={{ duration: 0.6 }}
            className="p-8 md:p-10 rounded-3xl border border-border bg-card dark:border-white/5 dark:bg-white/[0.02]"
          >
            <div className="inline-flex p-3 rounded-xl bg-primary/10 mb-6">
              <Target className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-2xl font-bold mb-4 text-foreground">Our Mission</h3>
            <p className="text-muted-foreground leading-relaxed">
              To help businesses innovate faster, reduce costs, and serve their customers better
              with the power of technology. We believe in making advanced AI and enterprise software
              accessible to organizations of all sizes, delivering solutions that drive measurable
              results and sustainable growth.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="p-8 md:p-10 rounded-3xl border border-border bg-card dark:border-white/5 dark:bg-white/[0.02]"
          >
            <div className="inline-flex p-3 rounded-xl bg-primary/10 mb-6">
              <Eye className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-2xl font-bold mb-4 text-foreground">Our Vision</h3>
            <p className="text-muted-foreground leading-relaxed">
              Becoming a global leader in AI-powered custom software solutions,
              setting new standards for innovation, quality, and client success
              in the digital transformation landscape.
            </p>
          </motion.div>
        </div>

        {/* Core Values */}
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-[11px] font-bold uppercase tracking-[0.35em] text-muted-foreground mb-4">
              What Drives Us
            </div>
            <h3 className="text-3xl md:text-4xl font-black tracking-tighter mb-4 text-foreground">
              Our Core Values
            </h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              These principles guide every decision we make and every solution we create
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
            {values.map((value, index) => {
              const IconComponent = value.icon;
              return (
                <motion.div
                  key={value.title}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  transition={{ duration: 0.5, delay: index * 0.08 }}
                  className="p-6 rounded-2xl border border-border bg-card text-center dark:border-white/5 dark:bg-white/[0.02]"
                >
                  <div className="inline-flex p-3 rounded-xl bg-primary/10 mb-4">
                    <IconComponent className="w-5 h-5 text-primary" />
                  </div>
                  <h4 className="text-lg font-bold mb-2 text-foreground">
                    {value.title}
                  </h4>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {value.description}
                  </p>
                </motion.div>
              );
            })}
          </div>

          {/* CTA - palette-inverted feature card */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden text-center bg-foreground text-background p-12 md:p-16 rounded-3xl"
          >
            <div className="absolute top-0 right-0 w-72 h-72 bg-primary/30 rounded-full blur-[120px] pointer-events-none" />
            <div className="relative z-10">
              <h3 className="text-3xl md:text-4xl font-black tracking-tighter mb-4">
                Ready to Experience the PopupGenix Difference?
              </h3>
              <p className="text-background/70 mb-8 max-w-2xl mx-auto">
                Join the growing list of businesses that have transformed their operations
                with our innovative AI and software solutions.
              </p>
              <Link to="/contact">
                <Button className="bg-background text-foreground hover:opacity-90">
                  Start Your Journey
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default About;
