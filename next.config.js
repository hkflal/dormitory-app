/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  trailingSlash: true,
  images: {
    unoptimized: true
  }
  // Removed i18n configuration to prevent automatic locale redirects
};

module.exports = nextConfig; 