interface ProductSharePayload {
  name: string;
  url: string;
  imageUrl?: string | null;
  price?: number | null;
  storeName?: string | null;
}

interface StoreSharePayload {
  name: string;
  url: string;
  imageUrl?: string | null;
}

export type ShareResult = "shared-image" | "shared-link" | "copied";
export type ProductShareResult = ShareResult;

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

async function shareContent({ title, text, url, imageUrl }: { title: string; text: string; url: string; imageUrl?: string | null }): Promise<ShareResult> {
  const shareData: ShareData = { title, text, url };

  if (typeof navigator !== "undefined" && navigator.share) {
    const image = await getShareableImage(imageUrl, title);
    if (image && navigator.canShare?.({ files: [image] })) {
      await navigator.share({ ...shareData, files: [image] });
      return "shared-image";
    }

    await navigator.share(shareData);
    return "shared-link";
  }

  await navigator.clipboard.writeText(url);
  return "copied";
}

export async function shareProduct(payload: ProductSharePayload): Promise<ProductShareResult> {
  return shareContent({
    title: payload.name,
    text: getShareText(payload),
    url: payload.url,
    imageUrl: payload.imageUrl,
  });
}

export async function shareStore(payload: StoreSharePayload): Promise<ShareResult> {
  return shareContent({
    title: payload.name,
    text: payload.name,
    url: payload.url,
    imageUrl: payload.imageUrl,
  });
}
