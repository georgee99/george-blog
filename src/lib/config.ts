export const siteConfig = {
  name: "George's Blog",
  author: "George Elz",
  tagline: "Software engineering, AI, reviews, and the things I can't stop thinking about",
  description:
    "George writes about software engineering, AI, technology, reviews, coffee, games, and life in Sydney.",
  url: process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://georgeelz.blog",
  defaultImage: "/og-default.svg",
  social: {
    github: "https://github.com/georgee99",
    twitter: "https://x.com/GeorgeEL99",
  },
};