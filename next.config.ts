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
  // The members' club lives on www.societyofexplorers.com. These old pages
  // listed figures that are not public domain and a plan price that no longer
  // exists, so send visitors to the current pages instead.
  async redirects() {
    const www = "https://www.societyofexplorers.com";
    return [
      { source: "/council", destination: `${www}/council`, permanent: false },
      { source: "/council/:path*", destination: `${www}/council`, permanent: false },
      { source: "/council-preview", destination: `${www}/council`, permanent: false },
      { source: "/join", destination: `${www}/founding`, permanent: false },
      { source: "/join/:path*", destination: `${www}/founding`, permanent: false },
    ];
  },
};

export default nextConfig;
