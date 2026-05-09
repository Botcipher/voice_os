/** @type {import('next').NextConfig} */
const nextConfig = {
  // No static export — Next.js runs as a real server
  trailingSlash: false,
  images: { unoptimized: true },
  // Proxy API calls to Express backend during dev
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:10000/:path*',
      },
    ]
  },
}
module.exports = nextConfig
