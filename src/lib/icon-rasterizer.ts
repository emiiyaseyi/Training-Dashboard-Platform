'use client'

import { createElement, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import type { LucideProps } from 'lucide-react'

export interface IconSpec {
  key: string
  icon: ComponentType<LucideProps>
  variant: 'circle' | 'square'
}

// Renders each icon badge (matching ReportTile's navy circle / SlideBUProfileCard's light-blue
// square exactly) into a detached DOM node, captures it to a PNG data URL via html-to-image, then
// discards the node. Used so the PPTX export embeds the real on-screen icons instead of a blank
// placeholder shape — pptxgenjs has no vector icon support, so a rasterized image is the only way
// to keep the exported file visually faithful to the app.
export async function rasterizeIconBadges(specs: IconSpec[]): Promise<Record<string, string>> {
  const { toPng } = await import('html-to-image')

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-10000px'
  container.style.top = '0'
  document.body.appendChild(container)

  const result: Record<string, string> = {}

  try {
    for (const spec of specs) {
      const node = document.createElement('div')
      container.appendChild(node)
      const root = createRoot(node)

      const size = 128
      const isCircle = spec.variant === 'circle'
      root.render(
        createElement(
          'div',
          {
            style: {
              width: size,
              height: size,
              borderRadius: isCircle ? '50%' : '22%',
              background: isCircle ? '#1B1F3B' : '#CADCFC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            },
          },
          createElement(spec.icon, {
            width: size * 0.5,
            height: size * 0.5,
            color: isCircle ? '#ffffff' : '#1E2761',
            strokeWidth: 2,
          })
        )
      )

      // Let React commit + the browser paint before capturing
      await new Promise((r) => setTimeout(r, 30))
      result[spec.key] = await toPng(node, { width: size, height: size, pixelRatio: 2 })

      root.unmount()
      container.removeChild(node)
    }
  } finally {
    document.body.removeChild(container)
  }

  return result
}
