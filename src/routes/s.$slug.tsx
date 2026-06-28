import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Grid3X3, LayoutGrid } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveStoreBySlug } from "@/lib/storefront";

export const Route = createFileRoute("/s/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} - Storefront` },
      { name: "description", content: "Browse this store's products." },
    ],
  }),
  component: StorefrontPage,
});

function StoreNotFound() {
  return (
    <div className="px-4 py-20 text-center">
      <h1 className="text-sm font-bold uppercase tracking-wider">Store not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">This store is unavailable or does not exist.</p>
    </div>
  );
}

function StorefrontPage() {
  const { slug } = Route.useParams();
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const isNestedRoute = location.pathname !== `/s/${slug}`;

  const { data: store, isLoading: storeLoading } = useQuery({
    queryKey: ["active-store", slug],
    queryFn: () => fetchActiveStoreBySlug(slug),
  });

  const { data: categories } = useQuery({
    queryKey: ["store-categories", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("store_id", store!.id)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["store-products", store?.id, activeCategory],
    enabled: !!store?.id,
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("*")
        .eq("store_id", store!.id)
        .order("created_at", { ascending: false });
      if (activeCategory) query = query.eq("category_id", activeCategory);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  if (storeLoading) {
    return (
      <div className="px-4 py-6 md:px-8">
        <div className="mb-6 h-5 w-40 animate-pulse bg-secondary" />
        <div className="grid grid-cols-3 gap-4 md:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-square animate-pulse bg-secondary" />)}
        </div>
      </div>
    );
  }

  if (!store) return <StoreNotFound />;

  if (isNestedRoute) return <Outlet />;

  return (
    <div className="px-4 py-6 md:px-8">
      {store.description && <p className="mb-5 max-w-2xl text-sm text-muted-foreground">{store.description}</p>}

      <div className="mb-6 flex items-center gap-3 overflow-x-auto">
        <button
          onClick={() => setActiveCategory(null)}
          className={`whitespace-nowrap border-b-2 pb-1 text-xs uppercase tracking-widest transition-colors ${
            !activeCategory ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          All
        </button>
        {categories?.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`whitespace-nowrap border-b-2 pb-1 text-xs uppercase tracking-widest transition-colors ${
              activeCategory === cat.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {cat.name}
          </button>
        ))}

        <button onClick={() => setExpanded(!expanded)} className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Toggle grid layout">
          {expanded ? <Grid3X3 className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
        </button>
      </div>

      {productsLoading ? (
        <div className={`grid gap-4 ${expanded ? "grid-cols-2 md:grid-cols-3" : "grid-cols-3 md:grid-cols-6"}`}>
          {Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-square animate-pulse bg-secondary" />)}
        </div>
      ) : products?.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted-foreground">No products yet.</p>
      ) : (
        <div className={`grid gap-4 ${expanded ? "grid-cols-2 md:grid-cols-3" : "grid-cols-3 md:grid-cols-6"}`}>
          {products?.map((product) => (
            <ProductCard key={product.id} product={product} compact={!expanded} categoryId={activeCategory} storeSlug={store.slug} />
          ))}
        </div>
      )}
    </div>
  );
}
