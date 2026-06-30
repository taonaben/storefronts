import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Grid3X3, LayoutGrid } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import { StoreClosedMessage } from "@/components/store/StoreClosedMessage";
import { supabase } from "@/integrations/supabase/client";
import { fetchStoreBySlug } from "@/lib/storefront";
import { getProductListKey, useProductStore } from "@/state/product_store";

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
  const loadStoreProducts = useProductStore((state) => state.loadStoreProducts);

  const { data: store, isLoading: storeLoading } = useQuery({
    queryKey: ["store", slug],
    queryFn: () => fetchStoreBySlug(slug),
  });

  const productListKey = store?.id && store.active ? getProductListKey(store.id, activeCategory) : null;
  const productIds = useProductStore((state) => (productListKey ? state.listIdsByKey[productListKey] : undefined));
  const productsById = useProductStore((state) => state.productsById);
  const productsLoading = useProductStore((state) => (productListKey ? state.listLoadingByKey[productListKey] : false));
  const productsError = useProductStore((state) => (productListKey ? state.listErrorsByKey[productListKey] : null));
  const products = productIds?.map((id) => productsById[id]).filter((product): product is NonNullable<typeof product> => Boolean(product));

  const { data: categories } = useQuery({
    queryKey: ["store-categories", store?.id],
    enabled: !!store?.id && store.active,
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

  useEffect(() => {
    if (!store?.id || !store.active) return;
    loadStoreProducts(store.id, activeCategory).catch((error) => {
      console.error("Failed to load storefront products", error);
    });
  }, [loadStoreProducts, store?.id, store?.active, activeCategory]);

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

  if (!store.active) return <StoreClosedMessage storeName={store.name} />;

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

      {productsError ? (
        <p className="py-20 text-center text-sm text-muted-foreground">{productsError}</p>
      ) : productsLoading || !products ? (
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
