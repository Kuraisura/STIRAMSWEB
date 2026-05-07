import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { mkdirSync } from 'fs'

// Fix Windows EPERM error: redirect TEMP to a project-local directory
// to avoid scanning protected system folders (e.g. WinSAT) during build
const __dirname = dirname(fileURLToPath(import.meta.url))
const localTmp = join(__dirname, '.buildtmp')
try { mkdirSync(localTmp, { recursive: true }) } catch {}
process.env.TEMP = localTmp
process.env.TMP = localTmp

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Handle font loading failures gracefully
  optimizeFonts: true,
}

export default nextConfig
