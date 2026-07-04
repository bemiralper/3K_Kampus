/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Django API URL'leri trailing slash kullanır. Next.js varsayılan olarak
  // trailing slash'lı URL'lere 308 redirect uygulayıp slash'ı kaldırır.
  // Bu, POST/PATCH gibi body'li isteklerde sorun çıkarır.
  skipTrailingSlashRedirect: true,
  experimental: {
    optimizePackageImports: [
      "recharts",
      "react-datepicker",
      "@fullcalendar/react",
      "@fullcalendar/daygrid",
      "@fullcalendar/timegrid",
      "@fullcalendar/interaction",
      "@fullcalendar/list",
    ],
  },
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    return [
      // Media dosyaları doğrudan backend'e yönlendirilir
      {
        source: '/media/:path*',
        destination: `${backendUrl}/media/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      { source: '/kurumumuz', destination: '/3k-sistemi', permanent: true },
      { source: '/kurumumuz/:path*', destination: '/3k-sistemi/:path*', permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000',
        pathname: '/media/**',
      },
    ],
  },
};

module.exports = nextConfig;
