import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  outputFileTracingIncludes: {
    "/api/great-books/**": ["./content/great-books/**/*"],
    "/api/library/**": ["./content/great-books/*/passages.json"],
    "/library/**": ["./content/great-books/*/passages.json"],
    "/clips": ["./content/clips/**/*"],
    "/clips/**": ["./content/clips/**/*"],
  },
  experimental: {
    scrollRestoration: false,
  },
};

export default nextConfig;
