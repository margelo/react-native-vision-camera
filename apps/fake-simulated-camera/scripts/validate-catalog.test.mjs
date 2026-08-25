// Run with `node --test scripts/validate-catalog.test.mjs`.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { validateCatalog } from './validate-catalog.mjs'

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scenesDirectory = path.join(appDir, 'scenes')
const base = JSON.parse(
  readFileSync(path.join(appDir, 'cameras', 'default.json'), 'utf8'),
)

const clone = () => structuredClone(base)

test('the shipped default catalog is valid', () => {
  validateCatalog(clone(), { scenesDirectory })
})

test('rejects a wrong schema version', () => {
  const catalog = clone()
  catalog.schemaVersion = 2
  assert.throws(
    () => validateCatalog(catalog, { scenesDirectory }),
    /\$\.schemaVersion/,
  )
})

test('rejects a missing scene file', () => {
  const catalog = clone()
  catalog.scene = 'does-not-exist.png'
  assert.throws(
    () => validateCatalog(catalog, { scenesDirectory }),
    /\$\.scene/,
  )
})

test('rejects an unknown pixel format with a path-specific message', () => {
  const catalog = clone()
  catalog.devices[0].formats[0].pixelFormat = 'not-a-format'
  assert.throws(
    () => validateCatalog(catalog, { scenesDirectory }),
    /\$\.devices\[0\]\.formats\[0\]\.pixelFormat/,
  )
})

test('rejects an inverted fps range', () => {
  const catalog = clone()
  catalog.devices[0].formats[0].fpsRanges = [[60, 1]]
  assert.throws(
    () => validateCatalog(catalog, { scenesDirectory }),
    /\$\.devices\[0\]\.formats\[0\]\.fpsRanges\[0\]/,
  )
})

test('rejects duplicate device ids', () => {
  const catalog = clone()
  catalog.devices[1].id = catalog.devices[0].id
  assert.throws(
    () => validateCatalog(catalog, { scenesDirectory }),
    /\$\.devices\[1\]: duplicate device id/,
  )
})

test('rejects a non-positive dimension', () => {
  const catalog = clone()
  catalog.devices[0].formats[0].width = 0
  assert.throws(
    () => validateCatalog(catalog, { scenesDirectory }),
    /\$\.devices\[0\]\.formats\[0\]\.width/,
  )
})

test('rejects an empty formats list', () => {
  const catalog = clone()
  catalog.devices[0].formats = []
  assert.throws(
    () => validateCatalog(catalog, { scenesDirectory }),
    /\$\.devices\[0\]\.formats/,
  )
})
