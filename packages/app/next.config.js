/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.externals.push(
      'pino-pretty',
      'lokijs',
      'encoding',
      // MetaMask SDK pulls in React Native storage — not needed in browser
      '@react-native-async-storage/async-storage'
    );
    return config;
  },
};

module.exports = nextConfig;
