import { maxPhotoBytes } from "../lib/photo-evidence";

export async function preparePhoto(
  file: File,
  { maxSide = 1600, maxBytes = maxPhotoBytes, square = false } = {},
) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const { naturalWidth, naturalHeight } = image;
    const width = square ? Math.min(naturalWidth, naturalHeight) : naturalWidth;
    const height = square ? width : naturalHeight;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const drawing = canvas.getContext("2d", { alpha: false });
    if (!drawing) throw new Error("Trình duyệt chưa xử lý được ảnh, hãy thử ảnh JPG khác");
    drawing.fillStyle = "#fff";
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    drawing.drawImage(image, (naturalWidth - width) / 2, (naturalHeight - height) / 2, width, height,
      0, 0, canvas.width, canvas.height);
    const photo = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!photo || photo.size > maxBytes) throw new Error("Ảnh quá lớn, hãy chọn ảnh nhỏ hơn");
    return photo;
  } finally {
    URL.revokeObjectURL(url);
  }
}
