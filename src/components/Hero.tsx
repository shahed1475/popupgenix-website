import { Button } from "@/components/ui/button";
import { ArrowRight, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { HeroVisual } from "@/components/HeroVisual";
import { RobotScene } from "@/components/RobotScene";
import { useEffect, useRef, useState } from "react";
import { scrollToSection } from "@/components/ScrollToHash";
import { canRunHeavyVisuals } from "@/lib/capability";

const stats = [
  { number: "50+", label: "Projects Delivered" },
  { number: "25+", label: "Global Clients" },
  { number: "5+", label: "Years in Business" },
];

const Hero = () => {
  // The robot picture follows your finger (or mouse) with a small 3D tilt, so
  // it feels alive on phones where the heavy live 3D scene is not loaded.
  const tiltRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tiltRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const tilt = (cx: number, cy: number) => {
      const x = (cx / window.innerWidth - 0.5) * 2;
      const y = (cy / window.innerHeight - 0.5) * 2;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = `rotateY(${(x * 16).toFixed(1)}deg) rotateX(${(-y * 10).toFixed(1)}deg)`;
      });
    };
    const reset = () => {
      cancelAnimationFrame(raf);
      el.style.transform = "";
    };
    const onTouch = (e: TouchEvent) => tilt(e.touches[0].clientX, e.touches[0].clientY);
    const onMouse = (e: MouseEvent) => {
      if (window.scrollY < window.innerHeight) tilt(e.clientX, e.clientY);
    };
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null || window.scrollY > window.innerHeight) return;
      const x = Math.max(-1, Math.min(1, e.gamma / 30));
      const y = Math.max(-1, Math.min(1, (e.beta - 50) / 30));
      el.style.transform = `rotateY(${(x * 14).toFixed(1)}deg) rotateX(${(-y * 8).toFixed(1)}deg)`;
    };
    window.addEventListener("touchstart", onTouch, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("touchend", reset, { passive: true });
    window.addEventListener("mousemove", onMouse, { passive: true });
    window.addEventListener("deviceorientation", onOrient, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("touchstart", onTouch);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchend", reset);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("deviceorientation", onOrient);
    };
  }, []);

  const [robotReady, setRobotReady] = useState(false);
  // The still robot picture is only a fallback: shown when the device cannot run
  // the live 3D scene, when it fails, or when it takes too long. Capable devices
  // never see it, so there is no swap between two different robots.
  const [showPoster, setShowPoster] = useState(false);
  useEffect(() => {
    if (!canRunHeavyVisuals({ minWidth: 0 })) {
      setShowPoster(true);
      return;
    }
    const t = window.setTimeout(() => setShowPoster(true), 15000);
    return () => window.clearTimeout(t);
  }, []);
  const onRobot = (ready: boolean) => {
    setRobotReady(ready);
    if (!ready) setShowPoster(true);
  };
  return (
    <section id="home" className="grain relative min-h-[100svh] flex items-center justify-center overflow-hidden pt-24 pb-12">
      {/* Single restrained background blob */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[36rem] h-[36rem] bg-primary/10 rounded-full blur-[140px]" />
      </div>

      {/* Full-bleed visual: the 3D robot on capable devices (phones included),
          the light animated mesh everywhere else */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <div className="absolute inset-y-0 right-0 w-full lg:w-[64%]">
          <HeroVisual
            className="h-full w-full transition-opacity duration-1000"
            style={{ opacity: robotReady ? 0.1 : undefined }}
          />
          {/* Fallback robot picture, only for devices that cannot run the live 3D scene. */}
          <div
            className="robot-float absolute inset-x-0 bottom-0 top-[50%] lg:inset-0 transition-opacity duration-1000"
            style={{ opacity: showPoster && !robotReady ? 1 : 0, perspective: "900px" }}
          >
            <div ref={tiltRef} className="absolute inset-0" style={{ transformStyle: "preserve-3d", transition: "transform 220ms ease-out" }}>
            {showPoster && (
              <>
            <img
              src="/hero/robot-dark.webp"
              alt=""
              width={522}
              height={578}
              fetchPriority="high"
              decoding="async"
              className="hidden dark:block absolute bottom-0 left-1/2 -translate-x-1/2 h-full max-h-full w-auto max-w-none object-contain lg:left-auto lg:right-[4%] lg:translate-x-0"
            />
            <img
              src="/hero/robot-light.webp"
              alt=""
              width={522}
              height={578}
              fetchPriority="high"
              decoding="async"
              className="dark:hidden absolute bottom-0 left-1/2 -translate-x-1/2 h-full max-h-full w-auto max-w-none object-contain lg:left-auto lg:right-[4%] lg:translate-x-0"
            />
              </>
            )}
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 top-[38%] pointer-events-none lg:inset-0 lg:pointer-events-auto">
            <RobotScene className="absolute inset-0" minWidth={0} onReady={onRobot} />
          </div>
        </div>
        {/* Readability: fade the scene into the page behind the headline and at the edges */}
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/35 to-transparent lg:hidden" />
        <div className="absolute inset-0 hidden lg:block bg-gradient-to-r from-background via-background/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background via-background/45 lg:via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 w-full pointer-events-none">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          {/* Text column */}
          <div className="text-center lg:text-left pointer-events-auto">
            {/* Eyebrow */}
            <div
              className="eyebrow inline-flex items-center gap-2 mb-8"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              AI &amp; Software Solutions
            </div>

            {/* Main Heading */}
            <h1
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter mb-6 leading-[1.05]"
            >
              <span className="text-foreground">Building Future-Ready</span>
              <br />
              <span className="text-muted-foreground">AI &amp; Software Solutions.</span>
            </h1>

            {/* Description */}
            <p
              className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-10 leading-relaxed"
            >
              PopupGenix builds custom software and AI tools that help your business grow. We make websites, mobile apps, CRM and ERP systems, and smart automation that saves you time.
            </p>

            {/* CTA Buttons */}
            <div
              className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4"
            >
              <Link to="/contact" className="w-full sm:w-auto">
                <Button variant="hero" size="xl" className="group w-full sm:w-auto">
                  Start Your Project
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <a href="#portfolio" onClick={(e) => { e.preventDefault(); history.replaceState(null, "", "#portfolio"); scrollToSection("portfolio"); }} className="w-full sm:w-auto">
                <Button variant="outline" size="xl" className="group w-full sm:w-auto">
                  <Zap className="w-5 h-5" />
                  View Portfolio
                </Button>
              </a>
            </div>
          </div>

          {/* Right column is empty on purpose: the visual is the section background */}
          <div className="hidden lg:block" aria-hidden="true" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 sm:gap-8 max-w-2xl mx-auto mt-12 lg:mt-24 rounded-2xl bg-background/75 px-2 py-4 lg:bg-transparent lg:p-0">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl font-black tracking-tight text-foreground mb-1">{stat.number}</div>
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Hero;
