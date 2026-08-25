#!/usr/bin/env node
// Validates every catalog in cameras/*.json. Native loaders apply the same rules.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const camerasDir = path.join(appDir, 'cameras')
const scenesDir = path.join(appDir, 'scenes')

export const SCHEMA_VERSION = 1
export const DEVICE_TYPES = [
  'wide-angle',
  'ultra-wide-angle',
  'telephoto',
  'dual',
  'dual-wide',
  'triple',
  'quad',
  'continuity',
  'lidar-depth',
  'true-depth',
  'time-of-flight-depth',
  'external',
]
export const POSITIONS = ['back', 'front']
export const PIXEL_FORMATS = [
  'yuv-420-8-bit-video',
  'yuv-420-8-bit-full',
  'yuv-420-10-bit-video',
  'yuv-420-10-bit-full',
  'yuv-422-8-bit-video',
  'yuv-422-8-bit-full',
  'yuv-422-10-bit-video',
  'yuv-422-10-bit-full',
  'yuv-444-8-bit-video',
  'yuv-444-8-bit-full',
  'rgb-bgra-8-bit',
]
export const AUTO_FOCUS_SYSTEMS = [
  'none',
  'contrast-detection',
  'phase-detection',
]
export const STABILIZATION_MODES = [
  'standard',
  'cinematic',
  'cinematic-extended',
  'preview-optimized',
  'cinematic-extended-enhanced',
  'low-latency',
]
export const COLOR_SPACES = [
  'srgb',
  'p3-d65',
  'hlg-bt2020',
  'apple-log',
  'apple-log-2',
]

class CatalogError extends Error {}

function fail(pathLabel, message) {
  throw new CatalogError(`${pathLabel}: ${message}`)
}

function expectType(value, type, pathLabel) {
  const actual = Array.isArray(value) ? 'array' : typeof value
  if (actual !== type) fail(pathLabel, `expected ${type}, got ${actual}`)
}

function expectEnum(value, allowed, pathLabel) {
  if (!allowed.includes(value)) {
    fail(
      pathLabel,
      `unknown value ${JSON.stringify(value)}, expected one of ${allowed.join(', ')}`,
    )
  }
}

function expectNonEmptyArray(value, pathLabel) {
  expectType(value, 'array', pathLabel)
  if (value.length === 0) fail(pathLabel, 'must not be empty')
}

function expectRange(value, pathLabel, { min, allowEqual = true } = {}) {
  expectType(value, 'array', pathLabel)
  if (value.length !== 2) fail(pathLabel, 'expected [min, max]')
  const [lo, hi] = value
  expectType(lo, 'number', `${pathLabel}[0]`)
  expectType(hi, 'number', `${pathLabel}[1]`)
  if (min !== undefined && lo < min)
    fail(`${pathLabel}[0]`, `must be >= ${min}`)
  if (allowEqual ? lo > hi : lo >= hi)
    fail(pathLabel, `min ${lo} must not exceed max ${hi}`)
}

function expectDimensions(value, pathLabel) {
  expectType(value, 'array', pathLabel)
  if (value.length !== 2) fail(pathLabel, 'expected [width, height]')
  for (const [index, side] of value.entries()) {
    expectType(side, 'number', `${pathLabel}[${index}]`)
    if (!Number.isInteger(side) || side <= 0)
      fail(`${pathLabel}[${index}]`, 'must be a positive integer')
  }
}

function expectUnique(values, pathLabel, what) {
  const seen = new Set()
  for (const [index, value] of values.entries()) {
    if (seen.has(value))
      fail(
        `${pathLabel}[${index}]`,
        `duplicate ${what} ${JSON.stringify(value)}`,
      )
    seen.add(value)
  }
}

function validateFormat(format, pathLabel) {
  expectType(format, 'object', pathLabel)
  expectType(format.name, 'string', `${pathLabel}.name`)
  for (const key of ['width', 'height']) {
    expectType(format[key], 'number', `${pathLabel}.${key}`)
    if (!Number.isInteger(format[key]) || format[key] <= 0)
      fail(`${pathLabel}.${key}`, 'must be a positive integer')
  }
  expectEnum(format.pixelFormat, PIXEL_FORMATS, `${pathLabel}.pixelFormat`)
  expectNonEmptyArray(format.fpsRanges, `${pathLabel}.fpsRanges`)
  for (const [index, range] of format.fpsRanges.entries()) {
    expectRange(range, `${pathLabel}.fpsRanges[${index}]`, { min: 1 })
  }
  expectNonEmptyArray(format.photoDimensions, `${pathLabel}.photoDimensions`)
  for (const [index, dims] of format.photoDimensions.entries()) {
    expectDimensions(dims, `${pathLabel}.photoDimensions[${index}]`)
  }
  expectEnum(
    format.autoFocusSystem,
    AUTO_FOCUS_SYSTEMS,
    `${pathLabel}.autoFocusSystem`,
  )
  expectType(
    format.videoStabilizationModes,
    'array',
    `${pathLabel}.videoStabilizationModes`,
  )
  for (const [index, mode] of format.videoStabilizationModes.entries()) {
    expectEnum(
      mode,
      STABILIZATION_MODES,
      `${pathLabel}.videoStabilizationModes[${index}]`,
    )
  }
  expectUnique(
    format.videoStabilizationModes,
    `${pathLabel}.videoStabilizationModes`,
    'stabilization mode',
  )
  expectNonEmptyArray(format.colorSpaces, `${pathLabel}.colorSpaces`)
  for (const [index, colorSpace] of format.colorSpaces.entries()) {
    expectEnum(colorSpace, COLOR_SPACES, `${pathLabel}.colorSpaces[${index}]`)
  }
  expectUnique(format.colorSpaces, `${pathLabel}.colorSpaces`, 'color space')
  for (const key of [
    'binned',
    'videoHDR',
    'highestPhotoQuality',
    'highPhotoQuality',
    'multiCam',
  ]) {
    expectType(format[key], 'boolean', `${pathLabel}.${key}`)
  }
}

function validateDevice(device, pathLabel) {
  expectType(device, 'object', pathLabel)
  for (const key of ['id', 'name', 'modelID']) {
    expectType(device[key], 'string', `${pathLabel}.${key}`)
    if (device[key].length === 0)
      fail(`${pathLabel}.${key}`, 'must not be empty')
  }
  expectEnum(device.type, DEVICE_TYPES, `${pathLabel}.type`)
  expectEnum(device.position, POSITIONS, `${pathLabel}.position`)
  for (const key of [
    'hasFlash',
    'hasTorch',
    'supportsFocus',
    'supportsExposure',
    'supportsWhiteBalance',
    'supportsLowLightBoost',
  ]) {
    expectType(device[key], 'boolean', `${pathLabel}.${key}`)
  }
  expectRange(device.zoom, `${pathLabel}.zoom`, { min: 1 })
  expectRange(device.exposureBias, `${pathLabel}.exposureBias`)
  for (const key of ['lensAperture', 'focalLength']) {
    expectType(device[key], 'number', `${pathLabel}.${key}`)
    if (device[key] <= 0) fail(`${pathLabel}.${key}`, 'must be positive')
  }
  expectNonEmptyArray(device.formats, `${pathLabel}.formats`)
  for (const [index, format] of device.formats.entries()) {
    validateFormat(format, `${pathLabel}.formats[${index}]`)
  }
  expectUnique(
    device.formats.map((f) => f.name),
    `${pathLabel}.formats`,
    'format name',
  )
}

export function validateCatalog(catalog, { scenesDirectory = scenesDir } = {}) {
  expectType(catalog, 'object', '$')
  if (catalog.schemaVersion !== SCHEMA_VERSION) {
    fail(
      '$.schemaVersion',
      `expected ${SCHEMA_VERSION}, got ${JSON.stringify(catalog.schemaVersion)}`,
    )
  }
  expectType(catalog.scene, 'string', '$.scene')
  if (!existsSync(path.join(scenesDirectory, catalog.scene))) {
    fail(
      '$.scene',
      `scene file ${JSON.stringify(catalog.scene)} does not exist in scenes/`,
    )
  }
  expectNonEmptyArray(catalog.devices, '$.devices')
  for (const [index, device] of catalog.devices.entries()) {
    validateDevice(device, `$.devices[${index}]`)
  }
  expectUnique(
    catalog.devices.map((d) => d.id),
    '$.devices',
    'device id',
  )
  expectUnique(
    catalog.devices.map((d) => d.name),
    '$.devices',
    'device name',
  )
}

function main() {
  const files = readdirSync(camerasDir).filter((f) => f.endsWith('.json'))
  if (files.length === 0) {
    console.error('no catalogs found in cameras/')
    process.exit(1)
  }
  let failed = false
  for (const file of files) {
    try {
      validateCatalog(
        JSON.parse(readFileSync(path.join(camerasDir, file), 'utf8')),
      )
      console.log(`✔ cameras/${file}`)
    } catch (error) {
      failed = true
      console.error(`✖ cameras/${file} — ${error.message}`)
    }
  }
  process.exit(failed ? 1 : 0)
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main()
}
