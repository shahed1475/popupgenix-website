// Single source of truth for site-wide content. Pages, SEO metadata, the sitemap
// and the prerender script all read from here, so copy only changes in one place.

export const SITE = {
  name: "PopupGenix",
  url: "https://popupgenix.com",
  tagline: "AI products and custom software for growing businesses",
  description:
    "PopupGenix is a founder-led studio in Albuquerque, NM that builds AI agents, custom software and SaaS platforms, and automates business workflows. Talk to us.",
  founded: 2024,
  email: "hello@popupgenix.com",
  emailAlt: "popupitcompany@gmail.com",
  phone: "+1 479 689 1012",
  phoneHref: "tel:+14796891012",
  whatsapp: "https://wa.me/8801838580258",
  // Set to a Cal.com / Calendly link once one exists; the UI falls back to the contact form.
  bookingUrl: "" as string,
  address: {
    street: "1209 Mountain Road PL NE, Ste R",
    city: "Albuquerque",
    region: "NM",
    postal: "87110",
    country: "US",
  },
  social: {
    linkedin: "https://www.linkedin.com/company/popupgenix",
    x: "https://x.com/popupgenix7",
    facebook: "https://www.facebook.com/profile.php?id=61577242150254",
    github: "https://github.com/shahed1475",
  },
  wordpress: {
    site: "shahedalfahad19-xvmtl.wordpress.com",
    api: "https://public-api.wordpress.com/wp/v2/sites/shahedalfahad19-xvmtl.wordpress.com",
    admin: "https://shahedalfahad19-xvmtl.wordpress.com/wp-admin/",
  },
  ogImage: "https://popupgenix.com/og-image.png",
} as const;

export interface NavItem {
  name: string;
  href: string;
}

export const MAIN_NAV: NavItem[] = [
  { name: "Services", href: "/services" },
  { name: "Work", href: "/work" },
  { name: "Process", href: "/process" },
  { name: "About", href: "/about" },
  { name: "Pricing", href: "/pricing" },
  { name: "Blog", href: "/blog" },
];

export interface Service {
  slug: string;
  /** legacy URL kept so existing links and search results keep working */
  path: string;
  title: string;
  short: string;
  icon:
    | "bot"
    | "code"
    | "globe"
    | "smartphone"
    | "users"
    | "cloud"
    | "brain";
  headline: string;
  intro: string;
  who: string;
  outcomes: string[];
  deliverables: string[];
  stack: string[];
  faqs: { q: string; a: string }[];
  metaTitle: string;
  metaDescription: string;
}

const SERVICE_LIST: Service[] = [
  {
    slug: "ai-sales-agents",
    path: "/services/ai-sales-agents",
    title: "AI Sales Agents",
    short:
      "Chat and voice agents that answer, qualify and book leads around the clock, connected to your CRM and calendar.",
    icon: "bot",
    headline: "An AI sales agent that answers every lead, every time",
    intro:
      "Most leads go cold because nobody replied fast enough. We build AI agents that respond instantly on your website, WhatsApp or phone, ask the right qualifying questions, and hand a warm, summarised lead to your team or straight onto your calendar.",
    who: "Service businesses, agencies, clinics, real estate teams and B2B companies that get inbound enquiries but lose them to slow follow-up.",
    outcomes: [
      "Instant first response to every enquiry, day or night",
      "Leads qualified against your own criteria before a human gets involved",
      "Meetings booked directly into your calendar",
      "Every conversation logged and summarised in your CRM",
    ],
    deliverables: [
      "Conversation design and tone-of-voice tuned to your business",
      "Knowledge base built from your own documents and website",
      "CRM, calendar and email or WhatsApp integrations",
      "Handover rules so a human takes over when it matters",
      "Analytics on conversations, qualified leads and booked meetings",
    ],
    stack: ["LLM APIs", "RAG over your documents", "Twilio / WhatsApp", "n8n or custom workers", "Supabase / Postgres"],
    faqs: [
      {
        q: "Will it sound like a robot to my customers?",
        a: "We write the conversation flow and tone with you, test it against real enquiries, and add clear handover to a human for anything sensitive or complex.",
      },
      {
        q: "Which tools can it connect to?",
        a: "Common CRMs, calendars, email and WhatsApp are standard. If your tool has an API, we can usually connect it.",
      },
      {
        q: "How long does a first version take?",
        a: "A focused website chat agent can usually be live within a few weeks. Voice and multi-channel agents take longer and are scoped after a discovery call.",
      },
    ],
    metaTitle: "AI Sales Agents for Lead Qualification and Booking",
    metaDescription:
      "Custom AI sales agents that reply instantly, qualify leads and book meetings, connected to your CRM and calendar. Built by PopupGenix.",
  },
  {
    slug: "custom-software",
    path: "/services/custom-software",
    title: "Custom Software",
    short:
      "Web platforms, internal tools and SaaS products designed around how your business actually works.",
    icon: "code",
    headline: "Software built around your process, not the other way round",
    intro:
      "Spreadsheets, off-the-shelf tools and manual hand-offs hold a lot of businesses back. We design and build the system that fits: multi-tenant platforms, internal dashboards, billing and ordering systems, and full SaaS products.",
    who: "Founders turning an idea into a product, and operations teams outgrowing spreadsheets and disconnected tools.",
    outcomes: [
      "One system instead of five disconnected tools",
      "Less manual data entry and fewer hand-off mistakes",
      "A product you own, with clean code your team can extend",
      "Role-based access and audit trails from day one",
    ],
    deliverables: [
      "Discovery and a written scope before any build starts",
      "Database design, API and admin dashboard",
      "Authentication, roles and permissions",
      "Automated tests and a documented deployment",
      "Handover documentation and training",
    ],
    stack: ["TypeScript", "React / Next.js", "Node.js / Python", "PostgreSQL / Prisma", "Docker"],
    faqs: [
      {
        q: "Do I own the code?",
        a: "Yes. You own the source code and the infrastructure accounts it runs on.",
      },
      {
        q: "Can you work with an existing codebase?",
        a: "Yes. We can audit, stabilise and extend existing products as well as build new ones.",
      },
      {
        q: "How do you price it?",
        a: "Fixed-scope for well-defined projects, and a monthly retainer for ongoing product work. See the pricing page for the models we use.",
      },
    ],
    metaTitle: "Custom Software Development for Growing Businesses",
    metaDescription:
      "Custom web platforms, internal tools and SaaS products built around your process. Clean code you own, delivered by PopupGenix.",
  },
  {
    slug: "ai-automation",
    path: "/services/ai-machine-learning",
    title: "AI & Automation",
    short:
      "Workflow automation, document processing, data analysis and AI features that remove repetitive work from your team.",
    icon: "brain",
    headline: "Automate the repetitive work, keep the judgement calls",
    intro:
      "We find the slow, repetitive parts of your operation, such as document processing, reporting, data analysis and follow-ups, and automate them with workflow tools, language-model features and predictive reporting where AI genuinely helps.",
    who: "Teams buried in manual data entry, document handling, reporting or content operations.",
    outcomes: [
      "Hours of weekly manual work removed",
      "Consistent processing instead of person-dependent quality",
      "Clear logs of what the automation did and why",
      "A human in the loop wherever accuracy matters",
    ],
    deliverables: [
      "Process audit and automation map",
      "Workflow builds with error handling and monitoring",
      "AI features such as classification, extraction and summarisation",
      "Evaluation on your real data before launch",
      "Documentation and a support window after go-live",
    ],
    stack: ["Python", "LLM APIs", "n8n", "Queues and workers", "PostgreSQL"],
    faqs: [
      {
        q: "Is AI always the answer?",
        a: "No. If a plain rule or script does the job reliably, we will say so and use that. AI is added where it measurably helps.",
      },
      {
        q: "What about data privacy?",
        a: "We design around your data policies, minimise what is sent to third-party models, and can use self-hosted models where required.",
      },
    ],
    metaTitle: "AI and Workflow Automation Services",
    metaDescription:
      "Remove repetitive work with workflow automation and practical AI features. Process audits, builds and monitoring from PopupGenix.",
  },
  {
    slug: "web-development",
    path: "/services/web-development",
    title: "Web Development",
    short:
      "Fast, accessible, search-friendly websites and web apps that look premium and convert.",
    icon: "globe",
    headline: "Websites that load fast, rank well and convert",
    intro:
      "From marketing sites to full web applications, we build for speed, accessibility and search from the start, so the site works for customers and for Google.",
    who: "Businesses that need a credible, fast website or a customer-facing web app.",
    outcomes: [
      "Fast load times and strong Core Web Vitals",
      "Clean on-page SEO foundations",
      "Accessible to keyboard and screen-reader users",
      "Easy publishing for your team",
    ],
    deliverables: [
      "Design system and responsive layouts",
      "SEO metadata, sitemap and structured data",
      "CMS or blog integration",
      "Analytics and conversion tracking",
      "Deployment and hosting setup",
    ],
    stack: ["React / Next.js", "Astro", "Tailwind CSS", "Cloudflare Pages", "WordPress (headless)"],
    faqs: [
      {
        q: "Can I edit the content myself?",
        a: "Yes. We connect a CMS or WordPress so your team can publish without a developer.",
      },
      {
        q: "Do you do redesigns?",
        a: "Yes. We keep what already ranks and converts, and fix what does not.",
      },
    ],
    metaTitle: "Web Development: Fast, Accessible, SEO-Ready Sites",
    metaDescription:
      "Premium websites and web apps built for speed, accessibility and search. Design, build and launch with PopupGenix.",
  },
  {
    slug: "mobile-apps",
    path: "/services/mobile-apps",
    title: "Mobile Apps",
    short:
      "Cross-platform iOS and Android apps with a polished, native feel and a solid backend.",
    icon: "smartphone",
    headline: "Mobile apps your customers keep on their home screen",
    intro:
      "We build cross-platform mobile apps and the backends behind them, with attention to performance, offline behaviour and a clean release process.",
    who: "Startups and businesses launching a customer or field-team app.",
    outcomes: [
      "One codebase for iOS and Android",
      "Smooth, responsive interface",
      "Secure authentication and data sync",
      "Store-ready releases",
    ],
    deliverables: [
      "UX flows and prototype",
      "App build and backend API",
      "Push notifications and analytics",
      "App Store and Google Play submission support",
    ],
    stack: ["React Native / Expo", "TypeScript", "Supabase / Postgres", "Firebase Cloud Messaging"],
    faqs: [
      {
        q: "Native or cross-platform?",
        a: "For most business apps cross-platform is faster and cheaper to maintain. We recommend native only when the product genuinely needs it.",
      },
    ],
    metaTitle: "Cross-Platform Mobile App Development",
    metaDescription:
      "iOS and Android apps from one codebase, with a secure backend and store-ready releases. Built by PopupGenix.",
  },
  {
    slug: "crm-saas",
    path: "/services/crm-saas",
    title: "CRM & SaaS Tools",
    short:
      "CRMs, client portals and subscription products with billing, roles and analytics built in.",
    icon: "users",
    headline: "CRMs and SaaS products with billing and roles built in",
    intro:
      "We build client portals, lead-management systems and subscription products, with multi-tenant architecture, role-based access and billing ready for real customers.",
    who: "Agencies and founders who need a client portal, a lead system or a subscription product.",
    outcomes: [
      "A single place for leads, clients and conversations",
      "Customers self-serve through a branded portal",
      "Subscription billing and plan limits",
      "Dashboards that show what is working",
    ],
    deliverables: [
      "Multi-tenant data model",
      "Client portal and admin dashboard",
      "Billing and plan management",
      "Email notifications and activity logs",
    ],
    stack: ["Next.js / React", "PostgreSQL / Supabase", "Stripe or Paddle", "Edge functions"],
    faqs: [
      {
        q: "Can you integrate with the CRM we already use?",
        a: "Usually yes. We can sync with existing systems or replace them with something that fits better.",
      },
    ],
    metaTitle: "CRM, Client Portal and SaaS Development",
    metaDescription:
      "Multi-tenant CRMs, client portals and subscription products with billing, roles and analytics. Built by PopupGenix.",
  },
  {
    slug: "cloud-devops",
    path: "/services/cloud-devops",
    title: "Cloud & DevOps",
    short:
      "Reliable deployments, CI/CD, monitoring and cost-aware cloud infrastructure.",
    icon: "cloud",
    headline: "Deployments that are boring, repeatable and monitored",
    intro:
      "We set up the pipelines, containers and monitoring that let your team ship safely, and keep cloud costs sensible while you grow.",
    who: "Teams shipping without a safety net, or paying too much for infrastructure they do not fully understand.",
    outcomes: [
      "Automated tests and deployments",
      "Faster, safer releases",
      "Visibility when something breaks",
      "A cloud bill that matches your usage",
    ],
    deliverables: [
      "CI/CD pipelines",
      "Docker and environment configuration",
      "Monitoring and alerting",
      "Backup and recovery plan",
    ],
    stack: ["GitHub Actions", "Docker", "Cloudflare", "AWS / GCP", "Terraform"],
    faqs: [
      {
        q: "Can you take over an existing setup?",
        a: "Yes. We start with an audit and fix the highest-risk issues first.",
      },
    ],
    metaTitle: "Cloud and DevOps: CI/CD, Monitoring, Infrastructure",
    metaDescription:
      "CI/CD pipelines, containerised deployments and monitoring for teams that want safer, faster releases. PopupGenix.",
  },
];

export const getService = (slug: string) => SERVICES.find((s) => s.slug === slug);

export interface CaseStudy {
  slug: string;
  name: string;
  tag: string;
  status: "Live" | "In development" | "Built";
  summary: string;
  problem: string;
  solution: string;
  highlights: string[];
  stack: string[];
  image?: string;
  url?: string;
  metaDescription: string;
}

// Only claims that are supported by the projects themselves. No invented client
// names, revenue figures or conversion numbers. Add real metrics here once they
// are available from the client.
export const CASE_STUDIES: CaseStudy[] = [
  {
    slug: "fluxpos",
    name: "FluxPOS",
    tag: "Multi-tenant SaaS",
    status: "Built",
    summary:
      "A point-of-sale and operations platform for restaurants and multi-vendor food markets.",
    problem:
      "Multi-vendor food markets need orders, inventory and vendor payouts in one place. Running them on separate tools makes settlement slow and error-prone.",
    solution:
      "A multi-tenant platform covering orders, tables and tabs with live updates, menus with recipes linked to ingredients, inventory and waste tracking, and a vendor settlement ledger with commissions and payouts.",
    highlights: [
      "Multi-tenant structure with branches, vendors, staff and shifts",
      "Real-time order and dashboard updates",
      "Vendor settlement: commission rules, rent agreements, payouts",
      "AI endpoints for business insights and recommendations",
      "Role-based access, audit log and subscription billing",
      "Data model with 38 models, installable as a web app",
    ],
    stack: ["Next.js", "TypeScript", "Prisma", "NextAuth", "Tailwind CSS"],
    image: "/portfolio/fluxpos.png",
    metaDescription:
      "FluxPOS: a multi-tenant POS and vendor settlement platform for restaurants and food markets, built by PopupGenix.",
  },
  {
    slug: "autolead-manager",
    name: "AutoLead Manager",
    tag: "Lead generation",
    status: "Live",
    summary:
      "An all-in-one sales growth engine: lead discovery, email campaigns, pipeline and client tracking in one dashboard.",
    problem:
      "Prospecting, outreach and follow-up spread across spreadsheets and inboxes means leads are missed and nobody knows what has been sent.",
    solution:
      "One dashboard that finds leads, runs email campaigns and tracks every prospect through the pipeline to a client record.",
    highlights: [
      "Lead discovery and campaign management in one place",
      "Pipeline and client tracking with clear status for every prospect",
      "Foundation for the AI sales agent workflow",
    ],
    stack: ["React", "TypeScript", "Automation", "Cloudflare Pages"],
    image: "/portfolio/autolead.png",
    url: "https://autolead-manager.pages.dev/",
    metaDescription:
      "AutoLead Manager: lead discovery, email campaigns and pipeline tracking in one dashboard, built by PopupGenix.",
  },
  {
    slug: "inno-ai",
    name: "Inno AI",
    tag: "Compliance platform",
    status: "In development",
    summary:
      "Under development: an ingredient compliance checker for EU and US food additive rules. Not yet public.",
    problem:
      "Food producers selling in both the EU and US have to check ingredients against two different additive rule sets, which is slow and easy to get wrong.",
    solution:
      "A web tool that checks ingredients against EU and US food additive rules and suggests substitutions. Currently being built and tested.",
    highlights: [
      "Checks ingredients against EU and US additive rules",
      "Suggests substitution ideas when an ingredient is a problem",
      "Runs on Cloudflare Workers with a D1 database",
      "Under development: not yet available to the public",
    ],
    stack: ["TypeScript", "Cloudflare Workers", "D1", "SQLite"],
    image: "/portfolio/inno-ai.png",
    metaDescription:
      "Inno AI: an EU and US food additive compliance checker, currently under development at PopupGenix.",
  },
  {
    slug: "clarify-ai",
    name: "Clarify AI",
    tag: "AI data analysis",
    status: "Live",
    summary:
      "An AI-powered data analysis platform that turns complex datasets into actionable insights.",
    problem:
      "Teams hold large datasets but lack the time or skills to turn them into decisions.",
    solution:
      "An AI platform that analyses complex data and presents the findings as clear, actionable insight.",
    highlights: [
      "AI-assisted analysis of complex datasets",
      "Insights presented for decision makers, not analysts",
    ],
    stack: ["Python", "React", "Data analytics", "AI/ML"],
    image: "/portfolio/clarify.png",
    url: "https://www.clarify.ai/",
    metaDescription:
      "Clarify AI: AI-powered data analysis that turns complex datasets into actionable insights. Built by PopupGenix.",
  },
  {
    slug: "klevere-ai",
    name: "Klevere AI",
    tag: "Business intelligence",
    status: "Live",
    summary:
      "A business intelligence platform using AI for predictive analytics and automated reporting.",
    problem:
      "Reporting is manual and backward-looking, so decisions lag behind the business.",
    solution:
      "A SaaS platform that automates reporting and adds predictive analytics on top of company data.",
    highlights: [
      "Automated reporting",
      "Predictive analytics for forward-looking decisions",
    ],
    stack: ["AI", "SaaS", "Analytics", "React"],
    image: "/portfolio/klevere.png",
    url: "https://www.klevere.ai/",
    metaDescription:
      "Klevere AI: a business intelligence platform with predictive analytics and automated reporting. Built by PopupGenix.",
  },
  {
    slug: "blackgpt",
    name: "BlackGPT",
    tag: "AI chatbot",
    status: "Live",
    summary:
      "A conversational AI chatbot with a specialised knowledge base and natural language understanding.",
    problem:
      "General-purpose chatbots rarely have the specialised knowledge a specific audience needs.",
    solution:
      "A chatbot built on a specialised knowledge base with natural-language understanding for focused answers.",
    highlights: [
      "Specialised knowledge base",
      "Natural-language understanding for conversational answers",
    ],
    stack: ["AI", "NLP", "Chatbot", "Machine learning"],
    image: "/portfolio/blackgpt.png",
    url: "https://blackgpt.us/",
    metaDescription:
      "BlackGPT: a conversational AI chatbot with a specialised knowledge base, built by PopupGenix.",
  },
  {
    slug: "ai-sales-employee",
    name: "PopupGenix AI Sales Employee",
    tag: "Our own product",
    status: "In development",
    summary:
      "A multi-tenant platform where each business configures its own AI voice sales agent.",
    problem:
      "Small businesses cannot staff a sales team that answers every call and chat instantly.",
    solution:
      "A clean-architecture platform with a voice runtime, knowledge base, CRM and calendar integrations, and barge-in so customers can interrupt the agent naturally.",
    highlights: [
      "Browser voice first, phone calls later without a rewrite",
      "Every provider (LLM, speech, telephony) swappable behind adapters",
      "Multi-tenant with per-business knowledge bases",
      "Currently in the architecture and foundations phase",
    ],
    stack: ["Python", "FastAPI", "PostgreSQL + pgvector", "Redis", "Docker"],
    image: "/portfolio/ai-sales-employee.png",
    metaDescription:
      "PopupGenix AI Sales Employee: our in-development platform for configurable AI voice sales agents.",
  },
];

/** AI-first order for every page that lists services (home, services hub, sitemap). */
const SERVICE_ORDER = ["ai-automation", "ai-sales-agents", "custom-software", "crm-saas", "web-development", "mobile-apps", "cloud-devops"];
export const SERVICES: Service[] = SERVICE_ORDER.map((slug) => {
  const s = SERVICE_LIST.find((x) => x.slug === slug);
  if (!s) throw new Error(`Unknown service slug in SERVICE_ORDER: ${slug}`);
  return s;
});

export const getCaseStudy = (slug: string) => CASE_STUDIES.find((c) => c.slug === slug);

export const PROCESS = [
  {
    step: "01",
    title: "Discover",
    body: "A short call to understand your goals, constraints and where time or money is being lost. You get a written scope and a fixed or phased quote.",
  },
  {
    step: "02",
    title: "Design",
    body: "We map the flows, data and interface, and share clickable designs or a technical plan for sign-off before building.",
  },
  {
    step: "03",
    title: "Build",
    body: "Work ships in small increments you can see and test, with automated tests, code review and weekly updates.",
  },
  {
    step: "04",
    title: "Launch",
    body: "Deployment, monitoring and a handover session, so you are never left guessing how it runs.",
  },
  {
    step: "05",
    title: "Support",
    body: "A support window after launch and optional monthly retainers for improvements and maintenance.",
  },
];

export const PRICING = [
  {
    name: "Starter",
    price: "$500",
    cadence: "per month",
    blurb: "Ongoing development and automation for small teams.",
    features: [
      "Dedicated monthly development hours",
      "Website and web app improvements",
      "Workflow automation and integrations",
      "Weekly progress updates",
      "Email support",
    ],
    cta: "Get started",
    featured: false,
  },
  {
    name: "Project",
    price: "Custom quote",
    cadence: "fixed scope",
    blurb: "A defined build such as an AI agent, portal or website.",
    features: [
      "Discovery and written scope",
      "Design, build and launch",
      "Automated tests and documentation",
      "30-day post-launch support",
      "You own the code",
    ],
    cta: "Request a quote",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "tailored",
    blurb: "Larger platforms, multi-tenant products and long-term partnerships.",
    features: [
      "Dedicated team and roadmap",
      "Security and compliance review",
      "Architecture and scaling plan",
      "Priority support",
    ],
    cta: "Talk to us",
    featured: false,
  },
];

export interface RouteMeta {
  path: string;
  title: string;
  description: string;
  priority?: number;
  noindex?: boolean;
}

export const STATIC_ROUTES: RouteMeta[] = [
  {
    path: "/",
    title: "Custom AI and Software Development Studio",
    description: SITE.description,
    priority: 1,
  },
  {
    path: "/services",
    title: "Services: AI, Custom Software, Automation, Web and Mobile",
    description:
      "AI and automation, AI agents, custom software and SaaS, web and mobile apps, and cloud services from PopupGenix, a founder-led studio.",
    priority: 0.9,
  },
  {
    path: "/work",
    title: "Selected Work and Case Studies",
    description:
      "Products built by PopupGenix: FluxPOS, AutoLead Manager, Clarify AI, Klevere AI and BlackGPT, plus what is still in development.",
    priority: 0.9,
  },
  {
    path: "/process",
    title: "How We Work: From Discovery to Launch",
    description:
      "Our five-step process: discover, design, build, launch and support. Clear scope, weekly updates, code you own.",
    priority: 0.7,
  },
  {
    path: "/about",
    title: "About PopupGenix",
    description:
      "PopupGenix is a founder-led studio in Albuquerque, NM, building AI products and custom software since 2024.",
    priority: 0.7,
  },
  {
    path: "/pricing",
    title: "Pricing: Retainers, Fixed-Scope Projects, Enterprise",
    description:
      "Transparent pricing for monthly development, fixed-scope projects and enterprise engagements.",
    priority: 0.8,
  },
  {
    path: "/blog",
    title: "Blog: AI, Automation and Software Insights",
    description:
      "Practical articles on AI, automation and custom software, from a founder-led studio that builds them.",
    priority: 0.7,
  },
  {
    path: "/contact",
    title: "Contact PopupGenix: Start a Project",
    description:
      "Tell us about your project. We reply within one business day with next steps.",
    priority: 0.9,
  },
  {
    path: "/privacy",
    title: "Privacy Policy",
    description: "How PopupGenix collects, uses and protects your information.",
    priority: 0.3,
  },
  {
    path: "/terms-and-conditions",
    title: "Terms and Conditions",
    description: "The terms that apply when you use PopupGenix services.",
    priority: 0.3,
  },
  {
    path: "/refund-policy",
    title: "Refund Policy",
    description: "PopupGenix refund and cancellation policy.",
    priority: 0.3,
  },
  {
    path: "/cookie-policy",
    title: "Cookie Policy",
    description: "How PopupGenix uses cookies.",
    priority: 0.3,
  },
];

export function allRoutes(): RouteMeta[] {
  const services: RouteMeta[] = SERVICES.map((s) => ({
    path: s.path,
    title: s.metaTitle,
    description: s.metaDescription,
    priority: 0.8,
  }));
  const work: RouteMeta[] = CASE_STUDIES.map((c) => ({
    path: `/work/${c.slug}`,
    title: `${c.name}: ${c.tag} Case Study`,
    description: c.metaDescription,
    priority: 0.6,
  }));
  return [...STATIC_ROUTES, ...services, ...work];
}
