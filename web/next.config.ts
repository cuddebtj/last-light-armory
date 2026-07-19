import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // All images are small (~96px) already-compressed Bungie CDN icons;
    // optimizing 2,208+ of them would burn Vercel's image-optimization
    // quota for no visible gain.
    unoptimized: true,
  },
};

export default nextConfig;
