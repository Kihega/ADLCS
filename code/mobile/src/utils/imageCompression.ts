/**
 * imageCompression.ts — Compress captured/selected photos before they're
 * held as base64 strings or uploaded.
 *
 * WHY THIS EXISTS:
 * On some devices, photos straight off the camera (especially newer phones
 * with 12–108MP sensors) can be several MB to tens of MB as raw JPEGs. The
 * NIN registration flow keeps the photo as a base64 data URI in React state
 * (for the live ID card preview) and later uploads it to the backend. A
 * multi-MB base64 string (~33% larger than the binary) held in memory next
 * to everything else on the screen is enough to trigger an OOM kill of the
 * app's process on lower/mid-range devices — which looks exactly like the
 * app silently "restarting" with no error in the logs, because the OS just
 * kills the process; the JS engine never gets the chance to throw or log
 * anything.
 *
 * `compressImage()` uses expo-image-manipulator to resize and re-encode the
 * image, iterating on JPEG quality (and shrinking dimensions if needed)
 * until the output is under `maxBytes` (default 3MB), then returns both the
 * file uri and a base64 data URI ready to use directly in <Image source>.
 */
import * as ImageManipulator from 'expo-image-manipulator'
import * as FileSystem from 'expo-file-system/legacy'

export const DEFAULT_MAX_BYTES = 3 * 1024 * 1024 // 3MB
const MAX_DIMENSION_START = 1280 // px — generous for an ID photo, not a full-res camera frame
const MIN_DIMENSION = 480 // px — don't shrink below recognizable face quality
const QUALITY_STEPS = [0.8, 0.65, 0.5, 0.35, 0.2]

export interface CompressedImage {
  uri: string
  base64: string
  /** data:image/jpeg;base64,... ready for <Image source={{ uri }}> */
  dataUri: string
  bytes: number
  width: number
  height: number
}

async function base64SizeBytes(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true } as any)
    if (info.exists && typeof (info as any).size === 'number') {
      return (info as any).size as number
    }
  } catch {
    // fall through to base64-length estimate below
  }
  return 0
}

/**
 * Resizes + re-encodes an image until it's at/under maxBytes, trying
 * decreasing JPEG quality first, then decreasing max dimension if quality
 * alone isn't enough. Always returns a result — worst case returns the
 * smallest attempted variant even if it's still slightly over the limit,
 * rather than throwing and crashing the registration flow.
 */
export async function compressImage(
  sourceUri: string,
  maxBytes: number = DEFAULT_MAX_BYTES
): Promise<CompressedImage> {
  let maxDimension = MAX_DIMENSION_START
  let lastResult: ImageManipulator.ImageResult | null = null
  let lastSize = Infinity

  outer: while (maxDimension >= MIN_DIMENSION) {
    for (const quality of QUALITY_STEPS) {
      const result = await ImageManipulator.manipulateAsync(
        sourceUri,
        [{ resize: { width: maxDimension } }],
        {
          compress: quality,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      )
      const sizeFromBase64 = result.base64
        ? Math.ceil((result.base64.length * 3) / 4)
        : Infinity
      const sizeOnDisk = await base64SizeBytes(result.uri)
      const size = sizeOnDisk || sizeFromBase64

      lastResult = result
      lastSize = size

      if (size <= maxBytes) {
        break outer
      }
    }
    // Quality alone wasn't enough at this dimension — shrink further.
    maxDimension = Math.round(maxDimension * 0.75)
  }

  if (!lastResult || !lastResult.base64) {
    throw new Error('Image compression failed — please retake the photo.')
  }

  return {
    uri: lastResult.uri,
    base64: lastResult.base64,
    dataUri: `data:image/jpeg;base64,${lastResult.base64}`,
    bytes: lastSize,
    width: lastResult.width,
    height: lastResult.height,
  }
}
