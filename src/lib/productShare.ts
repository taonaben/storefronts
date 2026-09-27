interface ProductSharePayload {
  name: string;
  url: string;
  imageUrl?: string | null;
  price?: number | null;
  storeName?: string | null;
}

export type ProductShareResult = "shared-image" | "shared-link" | "copied";

function getShareText({ name, price, storeName }: ProductSharePayload) {
  const priceText = typeof price === "number" ? ` - $${price.toFixed(2)}` : "";
  const storeText = storeName ? ` at ${storeName}` : "";
  return `${name}${priceText}${storeText}`;
}

function imageExtension(mimeType: string) {
  const extensions: Record<string, string> = {
    "image/avif": "avif",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/webp": "webp",
  };

  return extensions[mimeType] ?? "image";
}

function imageFileName(name: string, mimeType: string) {
  const baseName = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${baseName || "product"}.${imageExtension(mimeType)}`;
}

async function getShareableImage(imageUrl: string | null | undefined, productName: string): Promise<File | null> {
  if (!imageUrl) return null;

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;

    const blob = await response.blob();
    const mimeType = (response.headers.get("content-type")?.split(";", 1)[0] || blob.type).toLowerCase();
    if (!mimeType.startsWith("image/")) return null;

    return new File([blob], imageFileName(productName, mimeType), { type: mimeType });
  } catch {
    return null;
  }
}

export async function shareProduct(payload: ProductSharePayload): Promise<ProductShareResult> {
  const title = payload.name;
  const text = getShareText(payload);
  const shareData: ShareData = { title, text, url: payload.url };

  if (typeof navigator !== "undefined" && navigator.share) {
    const image = await getShareableImage(payload.imageUrl, payload.name);
    if (image && navigator.canShare?.({ files: [image] })) {
      await navigator.share({ ...shareData, files: [image] });
      return "shared-image";
    }

    await navigator.share(shareData);
    return "shared-link";
  }

  await navigator.clipboard.writeText(payload.url);
  return "copied";
}
