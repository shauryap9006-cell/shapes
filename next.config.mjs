/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: "/shapes",
  images: {
    unoptimized: true,
  },
  // These headers enable SharedArrayBuffer in local dev (next dev).
  // In production (output: "export" / GitHub Pages), headers() is ignored by
  // Next.js — the coi-serviceworker.js handles cross-origin isolation there.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};


export default nextConfig;
