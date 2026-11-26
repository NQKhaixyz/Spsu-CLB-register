import { AuthError } from "./password";
import { maxPhotoBytes } from "./photo-evidence";

export const privatePhotoHeaders = { "Cache-Control": "private, no-store", "Cross-Origin-Resource-Policy": "same-origin" };

export const photoResponse = (body: ReadableStream) => new Response(body, {
  headers: {
    ...privatePhotoHeaders, "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  },
});

export function verifyOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new AuthError("Nguồn yêu cầu không hợp lệ.", 403);
}

export async function readBody(request: Request, type: string, limit: number, tooLarge: string) {
  if (request.headers.get("content-type")?.split(";")[0] !== type || !request.body)
    throw new AuthError("Nội dung gửi lên không đúng định dạng.", 415);
  if (Number(request.headers.get("content-length")) > limit) throw new AuthError(tooLarge, 413);
  const reader = request.body.getReader();
  const bytes = new Uint8Array(limit);
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (length + value.byteLength > bytes.length) {
        await reader.cancel();
        throw new AuthError(tooLarge, 413);
      }
      bytes.set(value, length);
      length += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  return bytes.subarray(0, length);
}

export async function readPhoto(request: Request) {
  const bytes = await readBody(request, "image/jpeg", maxPhotoBytes, "Ảnh vượt quá 2 MB.");
  const { length } = bytes;
  if (length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff ||
      bytes[length - 2] !== 0xff || bytes[length - 1] !== 0xd9) {
    throw new AuthError("Tệp ảnh JPG không hợp lệ.", 415);
  }
  return bytes;
}
