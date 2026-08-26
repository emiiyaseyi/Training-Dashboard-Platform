import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // puppeteer-core and @sparticuz/chromium ship native binary files (the actual Chromium
  // executable) that Next.js's bundler mishandles if left to trace/bundle them normally — it
  // relocates the package without its bin/ directory, so the deployed function looks for
  // Chromium at a path that was never actually copied there. Marking them external tells
  // Next.js to leave them as plain node_modules requires at runtime instead, which keeps their
  // real file layout intact — but per Next.js's own docs, tracing can still miss files it
  // doesn't statically see being required, so the bin/ directory also needs to be explicitly
  // included for every route that (transitively, via bu-report-pdf.ts) uses it.
  serverExternalPackages: ['@prisma/client', 'prisma', 'puppeteer-core', '@sparticuz/chromium'],
  outputFileTracingIncludes: {
    '/api/cron/send-bu-reports': ['node_modules/@sparticuz/chromium/**/*'],
    '/api/admin/report-automation/send-now': ['node_modules/@sparticuz/chromium/**/*'],
  },
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
