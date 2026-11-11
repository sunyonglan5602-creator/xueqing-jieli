export const PHOTO_LIMIT = 300 * 1024

export function photoTooBig(byteLength) {
  return byteLength > PHOTO_LIMIT
}

export async function compressPhoto(file) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement("canvas")
  const edge = Math.max(bitmap.width, bitmap.height)
  const scale = Math.min(1, 1280 / edge)
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  let quality = 0.8
  let blob = await canvasBlob(canvas, quality)
  while (blob && photoTooBig(blob.size) && quality > 0.4) {
    quality -= 0.1
    blob = await canvasBlob(canvas, quality)
  }
  if (!blob || photoTooBig(blob.size)) throw new Error("单张图片不能超过 300KB")
  return blobToDataUrl(blob)
}

function canvasBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality))
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("单张图片不能超过 300KB"))
    reader.readAsDataURL(blob)
  })
}
