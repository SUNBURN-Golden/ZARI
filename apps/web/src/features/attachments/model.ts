import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_COUNT,
  SCHEMA_VERSION,
  type AttachmentRow,
} from '../../persistence/db';
import type { ProjectRepository } from '../../persistence/repository';

/**
 * Local-only photo attachments (Ticket 009, PERFORMANCE_SECURITY_FAILURES §3).
 * Bounds: ≤10 MiB per original, ≤20 million decoded pixels, ≤10 per project,
 * JPEG/PNG/WebP only — SVG/HTML and every other type reject before decode.
 * The stored bytes are a decode/re-encode derivative so EXIF/GPS metadata
 * cannot survive at rest; nothing here transmits, infers mm, or feeds the
 * solver context.
 */

export const ATTACHMENT_MAX_PIXELS = 20_000_000;
export const ATTACHMENT_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AttachmentMime = (typeof ATTACHMENT_MIMES)[number];

export type AttachRejectCode =
  | 'file_too_large'
  | 'unsupported_type'
  | 'pixel_limit_exceeded'
  | 'decode_failed'
  | 'project_full'
  | 'persist_failed';

export type AttachResult =
  | { status: 'saved'; row: AttachmentRow }
  | { status: 'rejected'; code: AttachRejectCode; detail?: string };

export interface DecodedImage {
  bytes: ArrayBuffer;
  width: number;
  height: number;
  mime: AttachmentMime;
}

/**
 * Re-encode the decoded image into a metadata-free derivative. Browser
 * builds inject the canvas implementation from `./image`; tests inject a
 * deterministic stub.
 */
export type ImageDecoder = (
  bytes: ArrayBuffer,
  mime: AttachmentMime,
) => Promise<DecodedImage>;

/** Magic-byte sniffing so a renamed HTML/SVG cannot masquerade as a photo. */
export function sniffMime(bytes: ArrayBuffer): AttachmentMime | null {
  const b = new Uint8Array(bytes.slice(0, 16));
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return 'image/png';
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return 'image/webp';
  return null;
}

export class AttachmentManager {
  constructor(
    private readonly repo: ProjectRepository,
    private readonly decode: ImageDecoder,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  list(projectId: string): Promise<AttachmentRow[]> {
    return this.repo.listAttachments(projectId);
  }

  /**
   * Attach one user-selected file. The original never leaves the device:
   * bytes are decoded, bounds-checked, re-encoded into a clean derivative and
   * committed in a single count-checked transaction.
   */
  async attach(
    projectId: string,
    file: { name: string; type: string; size: number; bytes: ArrayBuffer },
  ): Promise<AttachResult> {
    if (file.size > ATTACHMENT_MAX_BYTES || file.bytes.byteLength > ATTACHMENT_MAX_BYTES)
      return { status: 'rejected', code: 'file_too_large' };
    const declared = ATTACHMENT_MIMES.find((m) => m === file.type);
    if (declared === undefined) return { status: 'rejected', code: 'unsupported_type' };
    const sniffed = sniffMime(file.bytes);
    // Declared type and magic bytes must agree — reject mismatches and
    // every non-image payload (SVG, HTML, polyglot containers).
    if (sniffed === null || sniffed !== declared)
      return { status: 'rejected', code: 'unsupported_type' };
    let decoded: DecodedImage;
    try {
      decoded = await this.decode(file.bytes, declared);
    } catch (error) {
      return {
        status: 'rejected',
        code: 'decode_failed',
        detail: error instanceof Error ? error.message : String(error),
      };
    }
    if (
      !Number.isInteger(decoded.width) ||
      !Number.isInteger(decoded.height) ||
      decoded.width <= 0 ||
      decoded.height <= 0 ||
      decoded.width * decoded.height > ATTACHMENT_MAX_PIXELS
    )
      return { status: 'rejected', code: 'pixel_limit_exceeded' };
    if (decoded.bytes.byteLength === 0 || decoded.bytes.byteLength > ATTACHMENT_MAX_BYTES)
      return { status: 'rejected', code: 'file_too_large' };
    const row: AttachmentRow = {
      schemaVersion: SCHEMA_VERSION,
      attachmentId: crypto.randomUUID(),
      projectId,
      name: file.name.slice(0, 1024),
      mime: decoded.mime,
      byteSize: decoded.bytes.byteLength,
      originalByteSize: file.size,
      width: decoded.width,
      height: decoded.height,
      bytes: decoded.bytes,
      createdAt: this.now(),
    };
    try {
      const result = await this.repo.addAttachment(row);
      if (result.status === 'full') return { status: 'rejected', code: 'project_full' };
      return { status: 'saved', row };
    } catch (error) {
      return {
        status: 'rejected',
        code: 'persist_failed',
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Removal deletes the row — the derivative bytes go with it. */
  async remove(attachmentId: string): Promise<void> {
    await this.repo.deleteAttachment(attachmentId);
  }
}

export { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_COUNT };
