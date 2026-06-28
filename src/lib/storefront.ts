import { supabase } from "@/integrations/supabase/client";

export const APP_NAME = "Storefronts";

export type PublicStore = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  order_notification_phone?: string | null;
};

export function storePath(slug: string) {
  return `/s/${slug}`;
}

export function productPath(slug: string, productId: string) {
  return `/s/${slug}/product/${productId}`;
}

export async function fetchActiveStoreBySlug(slug: string) {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, slug, description, logo_url, order_notification_phone")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  return data as PublicStore | null;
}

export async function fetchStoreById(storeId: string) {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, slug, description, logo_url, order_notification_phone")
    .eq("id", storeId)
    .maybeSingle();

  if (error) throw error;
  return data as PublicStore | null;
}

