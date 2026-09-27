import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_IMAGE_ACCEPT, optimizeImageForUpload } from "@/lib/imageOptimization";

export const STORE_DISPLAY_PICTURE_ACCEPT = PRODUCT_IMAGE_ACCEPT;

export async function uploadStoreDisplayPicture(storeId: string, file: File) {
  const optimized = await optimizeImageForUpload(file);
  const path = `stores/${storeId}/display-pictures/${Date.now()}.webp`;
  const { error: uploadError } = await supabase.storage.from("product-images").upload(path, optimized);
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
  const { error: updateError } = await supabase.from("stores").update({ logo_url: urlData.publicUrl }).eq("id", storeId);
  if (updateError) throw updateError;

  return urlData.publicUrl;
}
