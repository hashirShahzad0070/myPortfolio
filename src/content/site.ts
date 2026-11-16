/* ==========================================================================
   SITE CONTENT — everything the site says about you lives here.
   ========================================================================== */

export type Project = {
  name: string;
  collab: string; // shown as a chip, e.g. "w/v4ideas"
  year: string;
  url: string;
  image?: string; // optional: "/work/muhafiz.jpg" (put files in /public/work)
  tint: string; // proof colour when there is no image
  mono?: string; // 2-letter monogram pressed into the die plate (defaults to initials)
};

export type Update = {
  date: string; // "Sep 2025"
  tag: "Work" | "Site" | "Project" | "Education" | "Lab" | "Writing";
  title: string;
  summary: string;
  href: string;
};

/** A tool in the Lab. Its poster is /public/lab/<slug>.svg (regenerate with: node scripts/lab-posters.mjs). */
export type LabItem = { slug: string; name: string; group: string; core?: boolean; href: string; tint: string };
/** A block of a post body: a section heading (also listed in the table of contents), a paragraph, a list or a quote. */
export type PostBlock = { h2: string } | { p: string } | { ul: string[] } | { quote: string };
export type Post = {
  slug: string; // the URL: /writing/<slug>
  title: string;
  date: string; // "NOV 11 2026" — shown on the folder and in the archive
  cat: string; // one of writing.categories
  summary: string;
  tldr?: string;
  // How the folder looks on the shelf. Leave these out for a random paper stock.
  cover?: "index" | "glyph" | "field" | "band" | "tiles" | "checker" | "lines" | "plan" | "scatter";
  tone?: "slate" | "cobalt" | "indigo" | "oxblood" | "teal" | "racing"; // a coloured folder
  stock?: "dark" | "light" | "grey";
  body: PostBlock[];
  credits?: { label: string; href: string }[];
};

const GITHUB = "https://github.com/HashirShahzad07";
const LINKEDIN = "https://www.linkedin.com/in/hashir-shahzad-66279324a/";

export const site = {
  name: "Hashir Shahzad",
  firstName: "Hashir",
  initials: ["H", "S"] as [string, string],
  role: "Full Stack Developer",
  email: "hashirshahzad129@gmail.com",
  location: "Karachi, Pakistan",
  from: "Imagination → Worldwide",
  timezone: "Asia/Karachi",
  tzLabel: "LOCAL",
  booking: "OPEN",
  description:
    "Full stack developer specialising in the MERN stack, React Native and Web3 — with growing expertise in cloud, DevOps and AI-powered automation.",

  socials: [
    { label: "GitHub", href: GITHUB },
    { label: "LinkedIn", href: LINKEDIN },
  ],

  /* Selected work — shown on the home wheels. Add `image` for a real screenshot. */
  projects: [
    { name: "Ideali", collab: "w/v4ideas", year: "2025", url: "https://ideali.io/", image: "/work/ideali.png", tint: "#3b5bdb", mono: "ID" },
    { name: "Muhafiz", collab: "fyp / fast nuces", year: "2024", url: GITHUB, tint: "#7a2e22", mono: "MU" },
    { name: "Whiplano", collab: "nft marketplace", year: "2024", url: GITHUB, tint: "#2b3b52", mono: "WP" },
    { name: "Islamify", collab: "scholar platform", year: "2025", url: GITHUB, tint: "#41583f", mono: "IS" },
    { name: "V4IDEAS", collab: "w/v4ideas", year: "2025", url: GITHUB, tint: "#c9b48a", mono: "V4" },
    { name: "Web3 Token Sites", collab: "freelance", year: "2021–2025", url: GITHUB, tint: "#141414", mono: "W3" },
    { name: "DApp Frontends", collab: "freelance", year: "2022–2025", url: GITHUB, tint: "#5c7a6b", mono: "DA" },
    { name: "Mobile Apps", collab: "react native", year: "2025", url: GITHUB, tint: "#8f6d4a", mono: "RN" },
    { name: "1LINK Automation", collab: "power platform", year: "2024", url: GITHUB, tint: "#33415c", mono: "1L" },
  ] as Project[],

  /* "What's new" feed (bell icon). Newest first. */
  updates: [
    { date: "Nov 2026", tag: "Site", title: "The new site is live", summary: "Rebuilt from scratch — a printing press for the work.", href: "/" },
    { date: "Sep 2025", tag: "Work", title: "Joined V4IDEAS", summary: "Frontend engineer. Cut redundant API calls ~20% and page loads ~15–20% with caching.", href: "/about" },
    { date: "Jun 2024", tag: "Education", title: "Graduated FAST NUCES", summary: "Bachelor of Software Engineering.", href: "/about" },
    { date: "Jun 2024", tag: "Project", title: "Muhafiz", summary: "Real-time crime tracking app — live map, Socket.io alerts, media reports.", href: "/" },
    { date: "Mar 2021", tag: "Work", title: "Started freelancing", summary: "Web3 clients worldwide — 100+ sites and DApps across Ethereum and Solana.", href: "/about" },
  ] as Update[],

  /* Lab — the stack, one row per tool. Posters live in /public/lab/<slug>.svg. */
  lab: [
    { slug: "react-native", name: "React Native", group: "Mobile", core: true, href: "https://reactnative.dev", tint: "#0e2a33" },
    { slug: "flutter", name: "Flutter", group: "Mobile", href: "https://flutter.dev", tint: "#0d2740" },
    { slug: "typescript", name: "TypeScript", group: "Frontend", core: true, href: "https://www.typescriptlang.org", tint: "#0b2c4a" },
    { slug: "javascript", name: "JavaScript", group: "Frontend", href: "https://developer.mozilla.org/docs/Web/JavaScript", tint: "#3a3410" },
    { slug: "react", name: "React", group: "Frontend", core: true, href: "https://react.dev", tint: "#10262e" },
    { slug: "nextjs", name: "Next.js", group: "Frontend", core: true, href: "https://nextjs.org", tint: "#161616" },
    { slug: "tailwindcss", name: "Tailwind CSS", group: "Frontend", href: "https://tailwindcss.com", tint: "#0c2735" },
    { slug: "nestjs", name: "NestJS", group: "Backend", core: true, href: "https://nestjs.com", tint: "#3a0f1a" },
    { slug: "nodejs", name: "Node.js", group: "Backend", core: true, href: "https://nodejs.org", tint: "#16301a" },
    { slug: "express", name: "Express", group: "Backend", href: "https://expressjs.com", tint: "#1d1d1f" },
    { slug: "mongodb", name: "MongoDB", group: "Backend", href: "https://www.mongodb.com", tint: "#0f2d1c" },
    { slug: "postgresql", name: "PostgreSQL", group: "Backend", href: "https://www.postgresql.org", tint: "#14263a" },
    { slug: "firebase", name: "Firebase", group: "Backend", href: "https://firebase.google.com", tint: "#3a2208" },
    { slug: "python", name: "Python", group: "Backend", href: "https://www.python.org", tint: "#14283c" },
    { slug: "fastapi", name: "FastAPI", group: "Backend", href: "https://fastapi.tiangolo.com", tint: "#0b3330" },
    { slug: "flask", name: "Flask", group: "Backend", href: "https://flask.palletsprojects.com", tint: "#202022" },
    { slug: "dotnet", name: ".NET", group: "Backend", href: "https://dotnet.microsoft.com", tint: "#24123a" },
    { slug: "cpp", name: "C++", group: "Backend", href: "https://isocpp.org", tint: "#0c2440" },
    { slug: "rest", name: "REST APIs", group: "Systems", href: "https://developer.mozilla.org/docs/Glossary/REST", tint: "#26283a" },
    { slug: "websockets", name: "WebSockets", group: "Systems", href: "https://socket.io", tint: "#1b1b1d" },
    { slug: "realtime", name: "Real-time APIs", group: "Systems", href: "https://developer.mozilla.org/docs/Web/API/WebSockets_API", tint: "#3a1712" },
    { slug: "pytorch", name: "PyTorch", group: "AI", href: "https://pytorch.org", tint: "#3a140c" },
    { slug: "scikit-learn", name: "scikit-learn", group: "AI", href: "https://scikit-learn.org", tint: "#14283a" },
    { slug: "git", name: "Git", group: "Tooling", href: "https://git-scm.com", tint: "#3a160d" },
    { slug: "github", name: "GitHub", group: "Tooling", href: GITHUB, tint: "#18181a" },
    { slug: "github-actions", name: "GitHub Actions", group: "Tooling", href: "https://github.com/features/actions", tint: "#0c2340" },
    { slug: "docker", name: "Docker", group: "Tooling", href: "https://www.docker.com", tint: "#0b2a3d" },
    { slug: "vercel", name: "Vercel", group: "Tooling", href: "https://vercel.com", tint: "#121212" },
  ] as LabItem[],

  writing: {
    intro: [
      "Notes from building things end to end — frontend, backend, mobile and the pipelines that ship them.",
      "I write to learn: documenting what worked, what didn’t, and what I’d do differently next time.",
    ],
    categories: ["web", "mobile", "web3", "devops", "ai"],
    // Newest first — the first post is the folder the shelf opens on.
    // STARTER DRAFTS: these are outlines built from your CV. Rewrite them in your own words before you publish.
    posts: [
      {
        slug: "fewer-requests-faster-pages",
        title: "Fewer requests, faster pages",
        date: "NOV 11 2026",
        cat: "web",
        cover: "index",
        summary: "What caching taught me about the requests a frontend never needed to make in the first place.",
        tldr: "Most of the speed I found at V4IDEAS didn’t come from faster code, it came from not asking twice. Caching what the app already knew cut redundant API calls by about 20% and page loads by 15–20%, and the bigger lesson was learning to see the requests nobody had questioned.",
        body: [
          { p: "When I joined V4IDEAS as a frontend engineer, the app felt slower than it had any right to. Nothing was obviously broken. Every screen loaded, every request succeeded. It just did a lot of asking." },
          { p: "This is a short write-up of how I went looking for that time, what I changed, and what I’d do first next time." },
          { h2: "Counting the asks" },
          { p: "The first step was boring on purpose: open the network tab, click through the app like a user would, and write down every request. Not the slow ones, all of them." },
          { p: "Patterns show up quickly when you do this. The same profile fetched by three components on one screen. A list refetched every time a tab regained focus. Lookup data that changes once a month, requested on every page." },
          { h2: "Caching what we already knew" },
          { p: "Once the duplicates were visible, the fix was mostly about deciding who owns the data. One cache, one place that fetches, and components that read instead of asking." },
          { ul: ["Shared data fetched once and read everywhere it’s needed.", "Rarely-changing lookups cached with a long lifetime.", "Refetches tied to things that actually change the data, not to focus or remounts."] },
          { p: "Together that cut redundant API calls by roughly 20%, and page loads improved by around 15–20%." },
          { h2: "What I’d do first next time" },
          { p: "Start with the count. It’s tempting to reach for a profiler or a bundle analyser, but the cheapest request is the one you never send, and you can’t remove what you haven’t written down." },
        ],
      },
      {
        slug: "a-hundred-token-sites",
        title: "A hundred token sites later",
        date: "OCT 27 2026",
        cat: "web3",
        cover: "glyph",
        tone: "slate",
        summary: "Notes from five years of freelancing for Web3 teams — the parts of a launch site that matter, and the parts that don’t.",
        tldr: "After 100+ sites and DApps across Ethereum, Solana and other chains, the pattern is clear: a launch site lives or dies on trust and speed. Wallet flows have to be boring, on-chain data has to be right, and everything else is decoration.",
        body: [
          { p: "I started freelancing for Web3 teams in 2021. Since then I’ve built more than a hundred token sites and DApp frontends across Ethereum, Solana and other chains, for clients all over the world." },
          { p: "The work repeats in useful ways. These are the notes I wish I’d had for the first one." },
          { h2: "Trust is the product" },
          { p: "A token site is often the first thing someone sees before they connect a wallet. If it feels rushed, they leave. Clear copy, a working contract link and a site that loads fast do more than any animation." },
          { h2: "Boring wallet flows" },
          { p: "Connecting MetaMask should feel like nothing happened. Every surprise in that flow — a wrong network, a silent failure, a button that does nothing — costs trust you don’t get back." },
          { ul: ["Detect the wrong network and say how to fix it.", "Show pending, confirmed and failed states for every transaction.", "Never leave a button that looks clickable but isn’t."] },
          { h2: "Reading the chain" },
          { p: "Displaying on-chain data sounds simple until you hit rate limits and slow nodes. Cache what you can, show what you have, and make loading states honest." },
        ],
      },
      {
        slug: "building-muhafiz",
        title: "Building Muhafiz",
        date: "OCT 08 2026",
        cat: "mobile",
        cover: "field",
        summary: "A real-time crime tracking app, built as my final year project at FAST NUCES — live maps, instant alerts and media reports.",
        tldr: "Muhafiz started as a final year project: a live map of reported incidents with instant alerts. The hard part wasn’t the map, it was making real-time feel trustworthy — events that arrive once, in order, with enough context to act on.",
        body: [
          { p: "Muhafiz was my final year project at FAST NUCES: a real-time crime tracking app. People can report an incident with photos or video, see reports near them on a live map, and get an alert when something happens close by." },
          { h2: "The live map" },
          { p: "The map is the heart of the app. Reports appear as they come in, and the view has to stay readable when a lot happens at once in one area." },
          { h2: "Alerts with Socket.io" },
          { p: "Alerts run over Socket.io. A new report is pushed to everyone nearby the moment it’s saved, instead of waiting for the next poll." },
          { p: "Real-time is easy to demo and hard to trust. Reconnects, duplicate events and out-of-order updates all show up the first time you test on a real phone on a real network." },
          { h2: "Media reports" },
          { p: "Letting people attach photos and video made reports far more useful, and far heavier. Uploads needed progress, retries and a report that still made sense while the media was on its way." },
          { h2: "What I’d change" },
          { p: "I’d design the event model before the screens. Most of the bugs I chased lived in the gap between what the server sent and what the app assumed." },
        ],
      },
    ] as Post[],
  },

  /* Studio page — your "dev pass" on a lanyard */
  studio: {
    name: "Hashir Shahzad",
    line: "Full stack, end to end",
    url: GITHUB,
    urlLabel: "github.com/HashirShahzad07",
    addr: "GITHUB.COM/HASHIRSHAHZAD07",
    role: "Full Stack Developer",
    place: "Worldwide",
    year: "2026",
    // Photo set into the badge's metal plate (printed black & white).
    // focus = crop centre (0..1 of the image), zoom = crop width as a share of the image width.
    photo: "/me.jpeg",
    photoFocus: { x: 0.53, y: 0.26, zoom: 0.62 },
    // Optional SVG mark used instead of the photo; leave both empty to use your initials.
    logoSvg: "",
    logoAspect: 1,
  },

  about: {
    ticket: { name: "The Front Office", job: "N°07", est: "2021", status: "OPEN" },
    position: "ONLINE / ANYWHERE",
    route: { fromCode: "IDEA", toCode: "WEB", from: "Imagination", to: "Worldwide", meta: "sketch → ship · since 2021" },
    letter: [
      "Hey, you pulled my file.",
      "I’m a full stack developer specialising in the MERN stack, with growing expertise in cloud, DevOps and AI-powered automation.",
      "I work across the whole lifecycle — responsive frontends, robust backend APIs, and scalable deployments on AWS, Azure, Docker and CI/CD.",
      "Days I’m a frontend engineer at V4IDEAS. Since 2021 I’ve freelanced for Web3 teams worldwide — 100+ sites and DApps across Ethereum, Solana and beyond.",
    ],
    record: [
      { company: "V4IDEAS", role: "Frontend Engineer", year: "Present" },
      { company: "Freelance", role: "Full Stack (Web3)", year: "Present" },
    ],
    onFile: [
      {
        title: "Education",
        items: [
          { org: "FAST NUCES", what: "BS Software Engineering", n: "2020–24" },
          { org: "Adamjee Govt. Science College", what: "Intermediate", n: "2018–20" },
        ],
      },
      {
        title: "Stack",
        items: [
          { org: "Frontend", what: "React · Next.js", n: "Daily" },
          { org: "Mobile", what: "React Native", n: "Shipped" },
          { org: "Backend", what: "Node · Express · MongoDB", n: "MERN" },
          { org: "Realtime", what: "Socket.io", n: "Live" },
          { org: "Web3", what: "MetaMask · on-chain data", n: "100+" },
          { org: "Cloud", what: "AWS · Azure · Docker", n: "CI/CD" },
          { org: "Automation", what: "Power Platform · AI", n: "Growing" },
        ],
      },
    ],
  },
};

export const nav = [
  { label: "About", href: "/about" },
  { label: "Lab", href: "/lab" },
  { label: "Writing", href: "/writing" },
  { label: "Studio", href: "/studio" },
  { label: "Contact", href: "/contact" },
];
