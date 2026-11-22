/** All landing-page copy. Sourced from the danmuck/portfolio repo and each project's README. */

export interface SiteLink {
	label: string;
	handle: string;
	href: string;
}

export interface SiteProject {
	name: string;
	description: string;
	stack: string[];
	/** Only set when a public repo exists */
	href?: string;
}

export interface SkillGroup {
	label: string;
	items: string[];
}

export interface Education {
	school: string;
	detail?: string;
	degree: string;
	year: string;
}

/** Web links open in a new tab; mailto links do not */
export function externalProps(href: string): {
	target?: "_blank";
	rel?: "noreferrer";
} {
	return href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {};
}

const links: SiteLink[] = [
	{
		label: "GitHub",
		handle: "github.com/danmuck",
		href: "https://github.com/danmuck",
	},
	{
		label: "LinkedIn",
		handle: "linkedin.com/in/danmuck",
		href: "https://www.linkedin.com/in/danmuck/",
	},
	{
		label: "Email",
		handle: "admin@danmuck.dev",
		href: "mailto:admin@danmuck.dev",
	},
];

const skills: SkillGroup[] = [
	{ label: "Languages", items: ["Go", "C", "Python", "Rust", "TypeScript"] },
	{
		label: "Networking",
		items: ["HTTP", "TCP / UDP", "WebRTC", "WebSockets", "gRPC"],
	},
	{
		label: "Tooling",
		items: ["UNIX / macOS", "Docker", "Git", "MongoDB", "Postgres", "Agile"],
	},
	{
		label: "Frameworks",
		items: ["Node.js", "React", "Next.js", "Go-Gin", "Django"],
	},
];

const education: Education[] = [
	{
		school: "University at Buffalo",
		detail: "School of Engineering and Applied Sciences",
		degree: "B.S. Computer Science",
		year: "2025",
	},
	{
		school: "Corning Community College",
		degree: "A.S. Computer Science",
		year: "2023",
	},
];

const projects: SiteProject[] = [
	{
		name: "edgectl",
		description:
			"A control plane for distributed service execution across heterogeneous nodes.",
		stack: ["Go", "TOML"],
		href: "https://github.com/danmuck/edgectl",
	},
	{
		name: "dps_files",
		description:
			"Decentralized storage combining a Raft-managed operational ledger with Kademlia DHT routing. Under construction.",
		stack: ["Go", "gRPC", "protobuf"],
		href: "https://github.com/danmuck/dps_files",
	},
	{
		name: "dps_net",
		description:
			"A simple peer-to-peer networking framework using Kademlia-style routing: peer discovery and messaging.",
		stack: ["Go", "gRPC", "Docker"],
		href: "https://github.com/danmuck/dps_net",
	},
	{
		name: "smplog",
		description:
			"A thin wrapper around zerolog: structured JSON logs, colored terminal logs, and stdout helpers for CLI menus.",
		stack: ["Go", "zerolog"],
		href: "https://github.com/danmuck/smplog",
	},
	{
		name: "dmux-rs",
		description: "Wrapper for tmux with layouts & themes, in one Rust binary.",
		stack: ["Rust", "tmux"],
		href: "https://github.com/danmuck/dmux-rs",
	},
	{
		name: "the_cookie_jar",
		description:
			"Learning management system built as a group project for a backend web development course.",
		stack: ["Go", "Gin", "JavaScript", "MongoDB", "Docker"],
		href: "https://github.com/danmuck/the_cookie_jar",
	},
	{
		name: "Kademlia DHT",
		description:
			"Distributed key-value store using the Kademlia protocol over gRPC.",
		stack: ["Go", "gRPC", "protobuf"],
	},
	{
		name: "Raft KV Store",
		description:
			"Raft consensus for leader election and log replication backed by an in-memory KV store.",
		stack: ["Go", "protobuf"],
	},
	{
		name: "Bytecode Interpreter",
		description:
			"Interpreter for a custom bytecode language with closures, higher-order functions, and streams.",
		stack: ["OCaml"],
	},
];

export const site = {
	name: "dan muck",
	mark: "dm",
	title: "dan muck.",
	role: "Systems & Network Programming",
	description:
		"Software engineer with a focus on distributed systems, networking, and developer tooling.",
	intro:
		"I build distributed systems, developer tooling, and clean interfaces. Fascinated with systems architecture and scaffolding multi-component systems from scratch to see where every byte goes.",
	about: [
		"Software engineer with a focus on distributed systems, networking, and developer tooling. I build things from scratch to understand how they work — from consensus algorithms to bytecode interpreters to HTTP servers. Currently based in Buffalo, NY.",
	],
	languages: ["Go", "C", "Python", "Rust"],
	skills,
	interests: [
		"Network Engineering",
		"Client / Server",
		"P2P & Distributed Systems",
		"Cloud Infrastructure",
		"Terminal Tooling",
		"Clean Frontends",
	],
	education,
	links,
	projects,
};
