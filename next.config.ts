import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@prisma/client', 'prisma'],
  webpack: (config, { isServer, webpack }) => {
    // pptxgenjs's browser build references Node core modules (fs/https) for its optional
    // Node.js file-writing path — these are never actually reached in the browser, but
    // webpack still needs to resolve them statically. Strip the node: scheme so the bare
    // specifier reaches resolve.fallback, then stub it out client-side only.
    if (!isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, '')
        })
      )
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        https: false,
        http: false,
      }
    }
    return config
  },
}

export default nextConfig
