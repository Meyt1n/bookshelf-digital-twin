#!/usr/bin/env node
/**
 * Offline GLB optimize with Meshopt compression (runtime via MeshoptGLTFLoader).
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), 'public/model')
const files = readdirSync(dir).filter((f) => f.endsWith('.glb'))
if (files.length === 0) {
  console.error('No GLB files in public/model')
  process.exit(1)
}

for (const file of files) {
  const input = join(dir, file)
  const before = statSync(input).size
  execFileSync(
    'npx',
    ['gltf-transform', 'optimize', input, input, '--compress', 'meshopt', '--texture-compress', 'false'],
    { stdio: 'inherit' },
  )
  const after = statSync(input).size
  const pct = (((before - after) / before) * 100).toFixed(1)
  console.log(`${file}: ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB (${pct}%)`)
}
