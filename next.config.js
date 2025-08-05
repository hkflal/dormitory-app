/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  trailingSlash: true,
  output: 'export',
  distDir: 'out',
  images: {
    unoptimized: true
  }
  // Redirects moved to firebase.json for static export compatibility
  // Removed i18n configuration to prevent automatic locale redirects
};

module.exports = nextConfig; 