/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // Dawna zakladka testowa "Newsy 2" jest teraz jedyna wersja newsow (/newsy).
      { source: '/newsy-2', destination: '/newsy', permanent: true },
    ];
  },
};

export default nextConfig;
