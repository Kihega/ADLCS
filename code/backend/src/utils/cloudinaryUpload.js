/**
 * cloudinaryUpload.js — Shared Cloudinary upload helper
 *
 * Configuration comes ONLY from backend/.env (see .env.example):
 *   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 *
 * Used to store citizen ID photos and generated certificate PDFs (birth,
 * death, marriage, NIN card) so they survive Render's ephemeral filesystem
 * and are reachable by URL from the mobile/web apps.
 */
const cloudinary = require('cloudinary').v2

let configured = false

function ensureConfigured() {
  if (configured) return
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, ' +
        'and CLOUDINARY_API_SECRET in backend/.env (see .env.example).'
    )
  }
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  })
  configured = true
}

/**
 * Uploads a base64 data URI (e.g. "data:image/jpeg;base64,..." or
 * "data:application/pdf;base64,...") to Cloudinary.
 *
 * @param {string} dataUri    Base64 data URI from the client.
 * @param {string} folder     Cloudinary folder, e.g. "tzcrvs/citizen_photos".
 * @param {string} publicId   Stable public_id, e.g. the citizen's NIN or cert no.
 * @param {'image'|'raw'} resourceType  'image' for photos, 'raw' for PDFs.
 * @returns {Promise<string>} The secure_url of the uploaded asset.
 */
async function uploadBase64(dataUri, folder, publicId, resourceType = 'image') {
  if (!dataUri || typeof dataUri !== 'string' || !dataUri.startsWith('data:')) {
    throw new Error('uploadBase64 expects a data: URI string')
  }
  ensureConfigured()
  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    public_id: publicId,
    resource_type: resourceType,
    overwrite: true,
  })
  return result.secure_url
}

module.exports = { uploadBase64, ensureConfigured }
