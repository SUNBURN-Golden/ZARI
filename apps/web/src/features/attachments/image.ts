import type { AttachmentMime, DecodedImage } from './model';

/**
 * Browser image decode → canvas re-encode. Drawing onto a canvas and
 * re-encoding produces a clean derivative: EXIF orientation/GPS/camera
 * metadata is dropped because the encoder writes only pixels. The stored
 * result is a display derivative — the UI labels it as such and never
 * claims it is the user's original file.
 */
export async function reencodeImage(
  bytes: ArrayBuffer,
  mime: AttachmentMime,
): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas_unavailable');
    ctx.drawImage(bitmap, 0, 0);
    const target: AttachmentMime = mime;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, target, 0.92),
    );
    // An encoder that cannot honour the requested type falls back to PNG —
    // still a supported derivative format, never the original bytes.
    const out =
      blob ??
      (await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png')));
    if (!out) throw new Error('encode_failed');
    const outMime: AttachmentMime =
      out.type === 'image/jpeg' || out.type === 'image/png' || out.type === 'image/webp'
        ? out.type
        : 'image/png';
    return {
      bytes: await out.arrayBuffer(),
      width: bitmap.width,
      height: bitmap.height,
      mime: outMime,
    };
  } finally {
    bitmap.close();
  }
}
