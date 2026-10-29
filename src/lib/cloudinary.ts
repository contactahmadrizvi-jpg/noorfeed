export interface CloudinaryResult {
  secure_url: string;
  public_id: string;
  resource_type: "image" | "video" | "raw";
  format: string;
}

export function getMediaType(file: File): "image" | "video" {
  return file.type.startsWith("video/") ? "video" : "image";
}

export async function uploadToCloudinary(
  file: File,
  onProgress?: (pct: number) => void
): Promise<CloudinaryResult> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!;
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/upload`;

  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", uploadPreset);

    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as CloudinaryResult);
      } else {
        reject(new Error(`Cloudinary upload failed: ${xhr.status}`));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Upload network error")));
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));
    xhr.open("POST", url);
    xhr.send(form);
  });
}
