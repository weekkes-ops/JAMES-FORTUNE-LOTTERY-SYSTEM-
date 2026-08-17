/**
 * Utility to optimize and downscale lottery bulletin images in browser canvas memory.
 * This prevents 413 Payload Too Large / Vercel 4.5MB request limit errors and dramatically speeds up OCR.
 */
export async function optimizeImageForOcr(file: File, maxDimension: number = 1800, quality: number = 0.88): Promise<{ optimizedBase64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to load image in browser canvas"));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Scale down proportionally if image exceeds maxDimension
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          // Fallback to original base64
          return resolve({
            optimizedBase64: e.target?.result as string,
            mimeType: file.type || "image/jpeg",
          });
        }

        // Fill white background for transparent PNGs
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const targetMime = "image/jpeg";
        const optimizedBase64 = canvas.toDataURL(targetMime, quality);

        resolve({
          optimizedBase64,
          mimeType: targetMime,
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
