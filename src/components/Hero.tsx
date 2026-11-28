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

      {/* Full-bleed visual: the 3D robot on capable devices (phones included),
          the light animated mesh everywhere else */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <div className="absolute inset-y-0 right-0 w-full lg:w-[64%]">
          <HeroVisual
            className="h-full w-full transition-opacity duration-1000"
            style={{ opacity: robotReady ? 0.1 : undefined }}
          />
          {/* On phones the robot sits in the lower part of the hero, behind the
              buttons and numbers, and never captures touch so the page scrolls. */}
          <div className="absolute inset-x-0 bottom-0 top-[40%] lg:inset-0 lg:pointer-events-auto">
            <RobotScene className="absolute inset-0" minWidth={0} onReady={setRobotReady} />
          </div>
        </div>
        {/* Readability: fade the scene into the page behind the headline and at the edges */}
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/75 to-background/40 lg:hidden" />
        <div className="absolute inset-0 hidden lg:block bg-gradient-to-r from-background via-background/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 w-full pointer-events-none">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          {/* Text column */}
          <div className="text-center lg:text-left pointer-events-auto">
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
              PopupGenix builds custom software and AI tools that help your business grow. We make websites, mobile apps, CRM and ERP systems, and smart automation that saves you time.
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

          {/* Right column is empty on purpose: the visual is the section background */}
          <div className="hidden lg:block" aria-hidden="true" />
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
