import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchStoreById } from "@/lib/storefront";

export const Route = createFileRoute("/product/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    cat: (search.cat as string) || undefined,
  }),
  head: () => ({
    meta: [
      { title: "Product - Storefronts" },
      { name: "description", content: "View product details." },
    ],
  }),
  component: ProductRedirect,
});

function ProductRedirect() {
  const { id } = Route.useParams();
  const { cat } = Route.useSearch();
  const navigate = useNavigate();

  const { data: product, isLoading: productLoading } = useQuery({
    queryKey: ["product-redirect", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, store_id").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: store, isLoading: storeLoading } = useQuery({
    queryKey: ["product-redirect-store", product?.store_id],
    enabled: !!product?.store_id,
    queryFn: () => fetchStoreById(product!.store_id),
  });

  useEffect(() => {
    if (!product || !store) return;
    navigate({
      to: "/s/$slug/product/$id",
      params: { slug: store.slug, id: product.id },
      search: { cat },
      replace: true,
    });
  }, [product, store, cat, navigate]);

  if (productLoading || storeLoading) {
    return <div className="px-4 py-20 text-center text-sm text-muted-foreground">Loading...</div>;
  }

  if (!product || !store) {
    return (
      <div className="px-4 py-20 text-center">
        <p className="text-sm text-muted-foreground">Product not found.</p>
        <Link to="/" className="mt-2 inline-block text-xs underline">Find a store</Link>
      </div>
    );
  }

  return null;
}
