import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'd918009a978a5f83b6d3c98120c2482d.r2.cloudflarestorage.com',
      }
    ],
  },
};

export default nextConfig;
