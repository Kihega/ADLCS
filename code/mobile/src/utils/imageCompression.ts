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
 * PATCH NOTE — the original version of this function requested
 * `base64: true` from expo-image-manipulator on EVERY search iteration
 * (up to 5 quality steps × several dimension-shrink rounds), not just the
 * final accepted one. That meant generating and holding several large
 * base64 strings in memory back-to-back, at the exact moment right after
 * the native camera/cropper handed off a large buffer — i.e. exactly when
 * memory was already under the most pressure. This was the real cause of
 * the crash right after tapping "save" on the cropped photo. Fixed by:
 *   1. Searching with `base64: false` (cheap — only measures the file on
 *      disk), and only reading base64 ONCE, from the final winning file.
 *   2. Raising the default size ceiling to 10MB (Cloudinary's free-tier
 *      per-image upload limit) so the very first attempt at a normal
 *      quality/dimension almost always succeeds immediately — meaning the
 *      loop typically now runs once instead of many times.
 *
 * `compressImage()` uses expo-image-manipulator to resize and re-encode the
 * image, iterating on JPEG quality (and shrinking dimensions if needed)
 * until the output is under `maxBytes`, then returns both the file uri and
 * a base64 data URI ready to use directly in <Image source>.
 */
import * as ImageManipulator from 'expo-image-manipulator'
import * as FileSystem from 'expo-file-system/legacy'

// Cloudinary's free-tier default max upload size for images is 10MB. Using
// that as our ceiling (rather than a much smaller 3MB) means most photos
// pass on the FIRST search iteration at good quality, instead of the loop
// grinding through several heavy re-encodes — which is itself what was
// causing the post-crop crash, independent of Cloudinary's actual limit.
export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024 // 10MB
const MAX_DIMENSION_START = 1280 // px — generous for an ID photo, not a full-res camera frame
const MIN_DIMENSION = 480 // px — don't shrink below recognizable face quality
const QUALITY_STEPS = [0.8, 0.6, 0.4] // fewer steps — with a 10MB ceiling, step 1 usually wins

export interface CompressedImage {
  uri: string
  base64: string
  /** data:image/jpeg;base64,... ready for <Image source={{ uri }}> */
  dataUri: string
  bytes: number
  width: number
  height: number
}

async function fileSizeBytes(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true } as any)
    if (info.exists && typeof (info as any).size === 'number') {
      return (info as any).size as number
    }
  } catch {
    // treated as unknown/zero below — search loop just keeps going
  }
  return 0
}

/**
 * Resizes + re-encodes an image until it's at/under maxBytes, trying
 * decreasing JPEG quality first, then decreasing max dimension if quality
 * alone isn't enough. Always returns a result — worst case returns the
 * smallest attempted variant even if it's still slightly over the limit,
 * rather than throwing and crashing the registration flow.
 *
 * IMPORTANT: every search iteration uses `base64: false` — we only care
 * about the resulting file's size on disk while searching. Base64 is read
 * back exactly ONCE at the end, from whichever file won, via a plain file
 * read rather than asking the image manipulator to re-encode again.
 */
export async function compressImage(
  sourceUri: string,
  maxBytes: number = DEFAULT_MAX_BYTES
): Promise<CompressedImage> {
  let maxDimension = MAX_DIMENSION_START
  let winnerUri: string | null = null
  let winnerWidth = 0
  let winnerHeight = 0
  let winnerSize = Infinity

  outer: while (maxDimension >= MIN_DIMENSION) {
    for (const quality of QUALITY_STEPS) {
      const result = await ImageManipulator.manipulateAsync(
        sourceUri,
        [{ resize: { width: maxDimension } }],
        {
          compress: quality,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: false,
        }
      )
      const size = await fileSizeBytes(result.uri)

      winnerUri = result.uri
      winnerWidth = result.width
      winnerHeight = result.height
      winnerSize = size || winnerSize

      if (size && size <= maxBytes) {
        break outer
      }
    }
    // Quality alone wasn't enough at this dimension — shrink further.
    maxDimension = Math.round(maxDimension * 0.75)
  }

  if (!winnerUri) {
    throw new Error('Image compression failed — please retake the photo.')
  }

  // Read base64 from the winning file exactly once, instead of asking the
  // image manipulator to redundantly re-encode-and-return-base64 on every
  // trial above.
  const base64 = await FileSystem.readAsStringAsync(winnerUri, {
    encoding: FileSystem.EncodingType.Base64,
  })

  return {
    uri: winnerUri,
    base64,
    dataUri: `data:image/jpeg;base64,${base64}`,
    bytes: winnerSize,
    width: winnerWidth,
    height: winnerHeight,
  }
}
