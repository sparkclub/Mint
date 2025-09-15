import path from 'path';
/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd(), '..', '..'),
};
export default nextConfig;
