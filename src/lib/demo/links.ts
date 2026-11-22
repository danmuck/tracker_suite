// Sample Links data: generic public sites, nothing personal.

export interface LinksSample {
  groups: {
    name: string;
    slug: string;
    icon: string;
    links: { name: string; url: string }[];
  }[];
}

export function linksSample(): LinksSample {
  return {
    groups: [
      {
        name: "Documentation",
        slug: "documentation",
        icon: "BookOpen",
        links: [
          { name: "MDN Web Docs", url: "https://developer.mozilla.org/" },
          { name: "Node.js", url: "https://nodejs.org/en/docs" },
          { name: "TypeScript", url: "https://www.typescriptlang.org/docs/" },
          { name: "React", url: "https://react.dev/" },
        ],
      },
      {
        name: "Reference",
        slug: "reference",
        icon: "Globe",
        links: [
          { name: "Wikipedia", url: "https://www.wikipedia.org/" },
          { name: "Wiktionary", url: "https://www.wiktionary.org/" },
          { name: "OpenStreetMap", url: "https://www.openstreetmap.org/" },
        ],
      },
      {
        name: "Dev tools",
        slug: "dev-tools",
        icon: "Wrench",
        links: [
          { name: "Can I use", url: "https://caniuse.com/" },
          { name: "regex101", url: "https://regex101.com/" },
          { name: "npm", url: "https://www.npmjs.com/" },
        ],
      },
    ],
  };
}
