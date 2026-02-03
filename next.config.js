/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Strict mode for better React practices
  reactStrictMode: true,
  
  // Production optimizations
  poweredByHeader: false,
};

module.exports = nextConfig;
