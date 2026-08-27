/**
 * Web-only file picking with an accept list that deliberately EXCLUDES HEIC.
 *
 * WebKit never exposes HEIC decoding to web content, so an `image/*` input on
 * iOS hands us raw HEIC bytes that neither <img> nor Tesseract can read. When
 * the accept list omits HEIC, iOS Safari transparently transcodes library
 * photos to JPEG during selection — which is exactly what we want.
 */

export type PickedWebFile = {
  uri: string;
  mimeType: string;
  fileName: string;
};

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

export function pickFileWeb(opts?: {
  acceptPdf?: boolean;
}): Promise<PickedWebFile | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = opts?.acceptPdf
      ? `${IMAGE_ACCEPT},application/pdf`
      : IMAGE_ACCEPT;
    input.style.display = 'none';
    document.body.appendChild(input);

    let settled = false;
    const done = (value: PickedWebFile | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return done(null);
      done({
        uri: URL.createObjectURL(file),
        mimeType: file.type,
        fileName: file.name,
      });
    });
    input.addEventListener('cancel', () => done(null));
    input.click();
  });
}
