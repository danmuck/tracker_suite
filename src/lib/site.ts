/**
 * Everything the public landing page says about its owner lives here.
 * Edit this file to change copy, links, skills or the project list.
 */

export interface SiteLink {
  label: string;
  href: string;
  /** Short text shown next to the label, e.g. a handle. */
  handle: string;
}

export interface Project {
  name: string;
  description: string;
  stack: string[];
  /** Repository or live URL. Omit when the source is not public. */
  href?: string;
}

export const site = {
  name: "dan muck",
  /** Two-letter mark used where the full wordmark does not fit. */
  mark: "dm",
  title: "dan muck.",
  role: "Systems & network programmer",
  description:
    "Dan Muck — systems and network programmer working on distributed systems, peer-to-peer networking and terminal tooling.",
  intro:
    "I build distributed systems, peer-to-peer networks and the terminal tooling around them. Look around to get an idea of the type of work that I do and the projects that interest me.",
  about: [
    "This site is both my portfolio and my daily workspace: a sandbox where I develop around ideas I care about, and the place my own tools live once they are useful enough to keep.",
    "The workspace above is the real thing, not a mock-up. Hosted, it runs on sample data kept in your own browser; on my machine the same modules run against my database.",
  ],
  languages: ["Go", "C", "Python", "Rust"],
  skills: [
    { label: "Languages", items: ["Go", "C", "Python", "Rust", "TypeScript"] },
    { label: "Networking", items: ["HTTP", "TCP/UDP", "WebSockets", "WebRTC", "gRPC"] },
    { label: "Tooling", items: ["UNIX / macOS", "Docker", "Git", "MongoDB", "Postgres"] },
    { label: "Frameworks", items: ["Gin", "Next.js", "React", "Node.js", "Django"] },
  ],
  interests: [
    "Network engineering",
    "Client/server, p2p and cloud infrastructure",
    "Terminal tooling and clean frontends",
  ],
  education: [
    "SUNY at Buffalo — School of Engineering and Applied Sciences",
    "Corning Community College",
  ],
  links: [
    { label: "GitHub", href: "https://github.com/danmuck", handle: "danmuck" },
    {
      label: "LinkedIn",
      href: "https://www.linkedin.com/in/danmuck/",
      handle: "in/danmuck",
    },
    { label: "Email", href: "mailto:admin@danmuck.dev", handle: "admin@danmuck.dev" },
  ] satisfies SiteLink[],
  projects: [
    {
      name: "edgectl",
      description:
        "Control plane for distributed service execution across heterogeneous nodes, with separate orchestration and execution runtimes over a custom framed protocol.",
      stack: ["Go"],
      href: "https://github.com/danmuck/edgectl",
    },
    {
      name: "dps_files",
      description:
        "Decentralized storage and backup: a Raft-managed operational ledger, Kademlia DHT routing for replicas and a blockchain ledger for immutable snapshots.",
      stack: ["Go"],
      href: "https://github.com/danmuck/dps_files",
    },
    {
      name: "dps_net",
      description:
        "Peer-to-peer networking framework with Kademlia-style routing: peer discovery and messaging over UDP.",
      stack: ["Go", "gRPC"],
      href: "https://github.com/danmuck/dps_net",
    },
    {
      name: "Raft with KV store",
      description: "The Raft consensus algorithm backing a replicated key-value store.",
      stack: ["Go", "protobuf"],
    },
    {
      name: "tracker_suite",
      description:
        "This site: a personal dashboard of small tools that runs against a database locally and entirely in the browser when hosted as static files.",
      stack: ["TypeScript", "Next.js", "MongoDB"],
      href: "https://github.com/danmuck/tracker_suite",
    },
    {
      name: "smplog",
      description:
        "Thin zerolog wrapper: structured JSON for collectors, colored output for local development and formatting helpers for CLI menus.",
      stack: ["Go"],
      href: "https://github.com/danmuck/smplog",
    },
    {
      name: "dmux",
      description:
        "tmux wrapper in a single binary: managed layout sessions and an interactive attach / detach / kill menu.",
      stack: ["Rust"],
      href: "https://github.com/danmuck/dmux-rs",
    },
    {
      name: "Bytecode interpreter",
      description:
        "Interpreter for a small custom bytecode language with functions, closures, higher-order functions and streams.",
      stack: ["OCaml"],
    },
    {
      name: "The Cookie Jar",
      description:
        "Learning management system built for a backend web development course.",
      stack: ["Go", "Gin", "React", "Nginx"],
      href: "https://github.com/danmuck/the_cookie_jar",
    },
  ] satisfies Project[],
} as const;
