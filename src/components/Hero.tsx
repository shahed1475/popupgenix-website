import { Button } from "@/components/ui/button";
import { ArrowRight, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { SplineScene } from "@/components/ui/splite";

const stats = [
  { number: "50+", label: "Projects Delivered" },
  { number: "25+", label: "Global Clients" },
  { number: "5+", label: "Years in Business" },
];

const Hero = () => {
  return (
    <section id="home" className="relative min-h-screen flex items-center justify-center overflow-hidden pt-24 pb-12">
      {/* Single restrained background blob */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="absolute top-1/3 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[36rem] h-[36rem] bg-primary/10 rounded-full blur-[140px]"
        />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 w-full">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          {/* Text column */}
          <div className="text-center lg:text-left">
            {/* Eyebrow */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.35em] text-muted-foreground mb-8"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              AI &amp; Software Solutions
            </motion.div>

            {/* Main Heading */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
              className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter mb-6 leading-[1.05]"
            >
              <span className="text-foreground">Building Future-Ready</span>
              <br />
              <span className="text-muted-foreground">AI &amp; Software Solutions.</span>
            </motion.h1>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-10 leading-relaxed"
            >
              PopupGenix is a custom software and AI solutions company that helps businesses grow
              through innovative technology. We build SaaS platforms, CRM and ERP systems, mobile
              and web applications, and advanced AI/ML solutions including predictive analytics
              and intelligent automation.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
              className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4"
            >
              <Link to="/contact" className="w-full sm:w-auto">
                <Button variant="hero" size="xl" className="group w-full sm:w-auto">
                  Start Your Project
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <a href="#portfolio" className="w-full sm:w-auto">
                <Button variant="outline" size="xl" className="group w-full sm:w-auto">
                  <Zap className="w-5 h-5" />
                  View Portfolio
                </Button>
              </a>
            </motion.div>
          </div>

          {/* 3D Spline scene */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="relative h-[320px] sm:h-[420px] lg:h-[500px] rounded-3xl border border-border bg-card overflow-hidden dark:border-white/5 dark:bg-white/[0.02]"
          >
            <SplineScene
              scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
              className="w-full h-full"
            />
          </motion.div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto mt-16 lg:mt-24">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 + index * 0.1, ease: "easeOut" }}
              className="text-center"
            >
              <div className="text-3xl font-black tracking-tight text-foreground mb-1">{stat.number}</div>
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Hero;
