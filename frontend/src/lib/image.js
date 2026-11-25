export const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;
export const MAX_ORIGINAL_PIXELS = 40_000_000;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_UPLOAD_DIMENSION = 2400;
export const MAX_DECODED_DIMENSION = 10_000;

const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export class ImageValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImageValidationError';
    this.code = code;
  }
}

export function formatBytes(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return '0 B';
  }
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function validateImageFileMetadata(file) {
  if (!file) {
    throw new ImageValidationError('NO_FILE', 'Choose a textbook photograph to continue.');
  }

  const name = (file.name || '').toLowerCase();
  const mime = (file.type || '').toLowerCase();

  if (
    mime === 'image/heic' ||
    mime === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  ) {
    throw new ImageValidationError(
      'UNSUPPORTED_HEIC',
      'HEIC/HEIF photos are not supported directly. Export or save the photo as JPEG, PNG, or WebP and try again.'
    );
  }

  const inferredSupported =
    SUPPORTED_MIME_TYPES.has(mime) ||
    (!mime && (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp')));

  if (!inferredSupported) {
    throw new ImageValidationError(
      'UNSUPPORTED_IMAGE_TYPE',
      'Use a JPEG, PNG, or WebP photograph of a textbook page.'
    );
  }

  if (file.size === 0) {
    throw new ImageValidationError('EMPTY_FILE', 'The selected file is empty. Please choose another image.');
  }

  if (file.size > MAX_ORIGINAL_BYTES) {
    throw new ImageValidationError(
      'FILE_TOO_LARGE',
      `This file is ${formatBytes(file.size)}, which exceeds the 20 MiB selection limit. Choose a smaller photo.`
    );
  }
}

async function decodeImageSource(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close?.(),
      };
    } catch {
      // Fall through to HTMLImageElement decoding if createImageBitmap rejects options
    }
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      resolve({
        source: img,
        width,
        height,
        cleanup: () => URL.revokeObjectURL(objectUrl),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new ImageValidationError(
          'INVALID_IMAGE',
          'Could not decode this image file. Choose a valid JPEG, PNG, or WebP photograph.'
        )
      );
    };
    img.src = objectUrl;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new ImageValidationError('ENCODE_FAILED', 'Could not prepare this image for upload.'));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
}

export async function prepareScanImage(file) {
  validateImageFileMetadata(file);

  const decoded = await decodeImageSource(file);
  try {
    const { source, width, height } = decoded;
    if (!width || !height) {
      throw new ImageValidationError(
        'INVALID_IMAGE',
        'This image appears empty or corrupted. Choose another photograph.'
      );
    }

    if (width * height > MAX_ORIGINAL_PIXELS) {
      throw new ImageValidationError(
        'IMAGE_TOO_LARGE',
        'This photograph exceeds 40 megapixels. Use a lower-resolution capture or crop to one page.'
      );
    }

    if (width > MAX_DECODED_DIMENSION || height > MAX_DECODED_DIMENSION) {
      throw new ImageValidationError(
        'IMAGE_TOO_LARGE',
        'Image dimensions exceed 10,000 pixels. Crop or resize the photo before uploading.'
      );
    }

    const longEdge = Math.max(width, height);
    const needsResize = longEdge > MAX_UPLOAD_DIMENSION;
    const needsRecompress = file.size > MAX_UPLOAD_BYTES;

    // Preserve smaller valid images as-is to avoid unnecessary recompression loss
    if (!needsResize && !needsRecompress) {
      return {
        blob: file,
        fileName: file.name || 'page.jpg',
        mimeType: file.type || 'image/jpeg',
        width,
        height,
        originalSize: file.size,
        processedSize: file.size,
        compressed: false,
      };
    }

    const scale = needsResize ? MAX_UPLOAD_DIMENSION / longEdge : 1;
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new ImageValidationError(
        'CANVAS_UNAVAILABLE',
        'Your browser could not resize this image. Choose an image under 8 MiB.'
      );
    }
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

    const qualities = [0.9, 0.82, 0.72, 0.6];
    let finalBlob = null;
    for (const quality of qualities) {
      const candidate = await canvasToBlob(canvas, 'image/jpeg', quality);
      finalBlob = candidate;
      if (candidate.size <= MAX_UPLOAD_BYTES) {
        break;
      }
    }

    if (!finalBlob || finalBlob.size > MAX_UPLOAD_BYTES) {
      throw new ImageValidationError(
        'IMAGE_TOO_LARGE',
        'Even after resizing, this image exceeds the 8 MiB upload limit. Crop closer to the textbook page.'
      );
    }

    const baseName = (file.name || 'page').replace(/\.[^.]+$/, '');
    const outputFile = new File([finalBlob], `${baseName}.jpg`, { type: 'image/jpeg' });

    return {
      blob: outputFile,
      fileName: outputFile.name,
      mimeType: 'image/jpeg',
      width: targetWidth,
      height: targetHeight,
      originalSize: file.size,
      processedSize: outputFile.size,
      compressed: true,
    };
  } finally {
    decoded.cleanup?.();
  }
}
