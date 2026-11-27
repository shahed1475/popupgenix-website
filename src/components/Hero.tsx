import { Button } from "@/components/ui/button";
import { ArrowRight, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { m } from "framer-motion";
import { HeroVisual } from "@/components/HeroVisual";
import { RobotScene } from "@/components/RobotScene";
import { useState } from "react";

const stats = [
  { number: "50+", label: "Projects Delivered" },
  { number: "25+", label: "Global Clients" },
  { number: "5+", label: "Years in Business" },
];

const Hero = () => {
  const [robotReady, setRobotReady] = useState(false);
  return (
    <section id="home" className="grain relative min-h-[100svh] flex items-center justify-center overflow-hidden pt-24 pb-12">
      {/* Single restrained background blob */}
      <div className="absolute inset-0 pointer-events-none">
        <m.div
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
            <m.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="eyebrow inline-flex items-center gap-2 mb-8"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              AI &amp; Software Solutions
            </m.div>

            {/* Main Heading */}
            <m.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter mb-6 leading-[1.05]"
            >
              <span className="text-foreground">Building Future-Ready</span>
              <br />
              <span className="text-muted-foreground">AI &amp; Software Solutions.</span>
            </m.h1>

            {/* Description */}
            <m.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-10 leading-relaxed"
            >
              PopupGenix is a custom software and AI solutions company that helps businesses grow
              through innovative technology. We build SaaS platforms, CRM and ERP systems, mobile
              and web applications, and advanced AI/ML solutions including predictive analytics
              and intelligent automation.
            </m.p>

            {/* CTA Buttons */}
            <m.div
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
            </m.div>
          </div>

          {/* Agent mesh — inline SVG, no 3D runtime */}
          <m.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }}
            className="surface-card relative h-[300px] sm:h-[420px] lg:h-[500px] overflow-hidden rounded-3xl"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--primary)/0.16),transparent_68%)]" />
            <HeroVisual
              className="relative h-full w-full transition-opacity duration-1000"
              style={{ opacity: robotReady ? 0.12 : 1 }}
            />
            <RobotScene className="absolute inset-0 z-10" onReady={setRobotReady} />
          </m.div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 sm:gap-8 max-w-2xl mx-auto mt-12 lg:mt-24">
          {stats.map((stat, index) => (
            <m.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 + index * 0.1, ease: "easeOut" }}
              className="text-center"
            >
              <div className="text-3xl font-black tracking-tight text-foreground mb-1">{stat.number}</div>
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{stat.label}</div>
            </m.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Hero;
