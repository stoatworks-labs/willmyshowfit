import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

/**
 * Stamp the support footer's script tag with this build's version.
 *
 * Never a literal beside the tag in index.html: that is right exactly until the
 * next release is tagged, and a feedback report naming the wrong build is worse
 * than one naming no build at all. Same string as __APP_VERSION__ below, which
 * is what the page footer shows.
 */
function supportFooterVersion(): Plugin {
  // Not anchored to a leading slash: this runs after Vite has rewritten public
  // asset paths, and this app builds with a relative `base`, so by the time we
  // see it the tag reads ./support-footer.js.
  const tag = /<script\s[^>]*\bsrc="[^"]*support-footer\.js"/
  return {
    name: 'stoatworks-support-footer-version',
    transformIndexHtml: {
      order: 'post',
      handler(html: string) {
        // Loud on purpose. The tag is hand-written markup, so a rename or a
        // tidy-up could silently detach the version from every report filed
        // afterwards, and nothing downstream would look wrong.
        if (!tag.test(html)) {
          throw new Error('no support-footer.js tag in index.html — nothing to stamp')
        }
        return html.replace(tag, (m) => `${m} data-version="v${pkg.version}"`)
      },
    },
  }
}

// Static SPA. No backend, and nothing to send to one: a show configuration is
// held in the tab and written to a file the user chooses.
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(`v${pkg.version}`) },
  plugins: [react(), supportFooterVersion()],
  base: './',
  build: { outDir: 'dist', sourcemap: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
