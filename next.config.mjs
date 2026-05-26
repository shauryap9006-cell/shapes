/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: "/shapes",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
