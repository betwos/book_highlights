import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.public.blob.vercel-storage.com" }],
  },
};

export default nextConfig;
