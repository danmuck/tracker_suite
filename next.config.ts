import type { NextConfig } from "next";

// The public build (NEXT_PUBLIC_DEMO=1) keeps all data in the visitor's browser, so it is
// exported as plain static files: no server, no API routes, no proxy.
const isStatic = process.env.NEXT_PUBLIC_DEMO === "1";

const nextConfig: NextConfig = isStatic
	? {
			distDir: process.env.NEXT_DIST_DIR || "out",
			output: "export",
			// Every API route.ts and src/proxy.ts are .ts files; pages and layouts are .tsx. Only
			// .tsx files become routes here, so no server code is part of the export.
			pageExtensions: ["tsx"],
			images: { unoptimized: true },
			productionBrowserSourceMaps: false,
		}
	: {
			distDir: process.env.NEXT_DIST_DIR || ".next",
		};

export default nextConfig;
