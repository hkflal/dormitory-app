/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  // Redirects to handle legacy i18n routes
  async redirects() {
    return [
      {
        source: '/en/:path*',
        destination: '/:path*',
        permanent: true,
      },
      {
        source: '/zh-hk/:path*',
        destination: '/:path*',
        permanent: true,
      },
    ]
  }
  // Removed i18n configuration to prevent automatic locale redirects
};

module.exports = nextConfig; 