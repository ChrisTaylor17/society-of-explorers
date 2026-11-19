import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@neondatabase/serverless", "@vercel/blob"],
  poweredByHeader: false,
};

export default nextConfig;
