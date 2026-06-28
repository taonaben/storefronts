import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fetchActiveStoreBySlug } from "@/lib/storefront";

export const Route = createFileRoute("/s/$slug/product/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    cat: (search.cat as string) || undefined,
  }),
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} - Product` },
      { name: "description", content: "View this store product." },
    ],
  }),
  component: StoreProductDetail,
});

function StoreNotFound() {
  return (
    <div className="px-4 py-20 text-center">
      <h1 className="text-sm font-bold uppercase tracking-wider">Store not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">This store is unavailable or does not exist.</p>
    </div>
  );
}

function SizeSelector({
  sizes,
  price,
  onSelect,
  onClose,
}: {
  sizes: Tables<"product_sizes">[];
  price: number;
  onSelect: (size: Tables<"product_sizes">) => void;
  onClose: () => void;
}) {
  const [showAlt, setShowAlt] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg animate-in slide-in-from-bottom bg-background px-6 pb-8 pt-5 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <button onClick={() => setShowAlt(!showAlt)} className="text-muted-foreground hover:text-foreground" aria-label="Toggle size format">
            <HelpCircle className="h-4 w-4" />
          </button>
          <span className="text-xs font-bold uppercase tracking-[0.2em]">Select Size</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 text-center text-sm font-medium">${price.toFixed(2)}</p>

        <div className="grid grid-cols-7 gap-2">
          {sizes.map((size) => {
            const outOfStock = size.stock <= 0;
            const displayLabel = showAlt && size.alt_label ? size.alt_label : size.label;
            return (
              <button
                key={size.id}
                disabled={outOfStock}
                onClick={() => onSelect(size)}
                className={`py-2 text-xs font-medium uppercase tracking-wider transition-colors ${
                  outOfStock ? "cursor-not-allowed text-muted-foreground/40 line-through" : "text-foreground hover:bg-foreground hover:text-background"
                }`}
              >
                {displayLabel}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StoreProductDetail() {
  const { slug, id } = Route.useParams();
  const { cat } = Route.useSearch();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [sizeOpen, setSizeOpen] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);

  const { data: store, isLoading: storeLoading } = useQuery({
    queryKey: ["active-store", slug],
    queryFn: () => fetchActiveStoreBySlug(slug),
  });

  const { data: product, isLoading: productLoading } = useQuery({
    queryKey: ["store-product", store?.id, id],
    enabled: !!store?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .eq("store_id", store!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: extraImages } = useQuery({
    queryKey: ["product-images", id],
    enabled: !!product?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("product_images").select("*").eq("product_id", id).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: sizes } = useQuery({
    queryKey: ["product-sizes", id],
    enabled: !!product?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("product_sizes").select("*").eq("product_id", id).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: siblings } = useQuery({
    queryKey: ["store-product-siblings", store?.id, cat || "all"],
    enabled: !!store?.id,
    queryFn: async () => {
      let query = supabase.from("products").select("id").eq("store_id", store!.id).order("created_at", { ascending: false });
      if (cat) query = query.eq("category_id", cat);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const allImages: string[] = [];
  if (product?.image_url) allImages.push(product.image_url);
  if (extraImages) {
    for (const image of extraImages) allImages.push(image.image_url);
  }
  if (allImages.length === 0) allImages.push("");

  useEffect(() => {
    setImageIndex(0);
  }, [id]);

  const goToImage = useCallback(
    (dir: "prev" | "next") => {
      setImageIndex((current) => {
        if (dir === "next") return current < allImages.length - 1 ? current + 1 : 0;
        return current > 0 ? current - 1 : allImages.length - 1;
      });
    },
    [allImages.length],
  );

  const currentIndex = siblings?.findIndex((item) => item.id === id) ?? -1;
  const prevId = siblings && currentIndex > 0 ? siblings[currentIndex - 1].id : siblings && siblings.length > 0 ? siblings[siblings.length - 1].id : null;
  const nextId = siblings && currentIndex < siblings.length - 1 ? siblings[currentIndex + 1].id : siblings && siblings.length > 0 ? siblings[0].id : null;

  const goToProduct = useCallback(
    (targetId: string | null) => {
      if (!targetId || targetId === id) return;
      navigate({ to: "/s/$slug/product/$id", params: { slug, id: targetId }, search: { cat } });
    },
    [navigate, slug, id, cat],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (sizeOpen) return;
      if (event.key === "ArrowLeft") goToImage("prev");
      if (event.key === "ArrowRight") goToImage("next");
      if (event.key === "ArrowUp") {
        event.preventDefault();
        goToProduct(prevId);
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        goToProduct(nextId);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goToImage, goToProduct, prevId, nextId, sizeOpen]);

  if (storeLoading) {
    return (
      <div className="px-4 py-6 md:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="aspect-square animate-pulse bg-secondary" />
        </div>
      </div>
    );
  }

  if (!store) return <StoreNotFound />;

  if (productLoading) {
    return (
      <div className="px-4 py-6 md:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="aspect-square animate-pulse bg-secondary" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="px-4 py-20 text-center">
        <p className="text-sm text-muted-foreground">Product not found.</p>
        <Link to="/s/$slug" params={{ slug: store.slug }} className="mt-2 inline-block text-xs underline">Back to store</Link>
      </div>
    );
  }

  const hasSizes = sizes && sizes.length > 0;
  const totalSizeStock = hasSizes ? sizes.reduce((sum, size) => sum + size.stock, 0) : 0;
  const isInStock = hasSizes ? totalSizeStock > 0 : product.stock > 0;
  const currentImage = allImages[imageIndex];
  const hasMultipleImages = allImages.length > 1;

  const handleAddToCart = () => {
    if (hasSizes) {
      setSizeOpen(true);
      return;
    }

    addItem({ id: product.id, store_id: product.store_id, name: product.name, price: product.price, image_url: product.image_url });
  };

  const handleSizeSelect = (size: Tables<"product_sizes">) => {
    addItem({
      id: product.id,
      store_id: product.store_id,
      name: product.name,
      price: product.price,
      image_url: product.image_url,
      size: size.label,
      size_id: size.id,
    });
    setSizeOpen(false);
  };

  return (
    <div className="relative min-h-[calc(100vh-57px)] px-4 py-6 md:px-8">
      <Link to="/s/$slug" params={{ slug: store.slug }} className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back
      </Link>

      {hasMultipleImages && (
        <>
          <button
            onClick={() => goToImage("prev")}
            className="hidden text-muted-foreground transition-colors hover:text-foreground md:fixed md:left-6 md:top-1/2 md:z-30 md:flex md:-translate-y-1/2"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-8 w-8" />
          </button>
          <button
            onClick={() => goToImage("next")}
            className="hidden text-muted-foreground transition-colors hover:text-foreground md:fixed md:right-6 md:top-1/2 md:z-30 md:flex md:-translate-y-1/2"
            aria-label="Next image"
          >
            <ChevronRight className="h-8 w-8" />
          </button>
        </>
      )}

      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[minmax(280px,560px)_minmax(200px,280px)] md:items-center md:justify-center md:gap-12">
        <div className="relative aspect-square overflow-hidden bg-secondary">
          {currentImage ? (
            <img src={currentImage} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-widest text-muted-foreground">No image</div>
          )}
          {hasMultipleImages && (
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {allImages.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setImageIndex(i)}
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${i === imageIndex ? "bg-foreground" : "bg-foreground/30"}`}
                  aria-label={`Image ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col justify-center">
          <h1 className="text-sm font-bold uppercase tracking-wider">{product.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">${product.price.toFixed(2)}</p>
          {isInStock ? (
            <Button onClick={handleAddToCart} className="mt-6 h-11 w-full text-xs uppercase tracking-widest">
              Add to Cart
            </Button>
          ) : (
            <p className="mt-4 text-xs uppercase tracking-wider text-destructive">Out of stock</p>
          )}

          {siblings && siblings.length > 1 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="text-xs uppercase" onClick={() => goToProduct(prevId)}>
                Previous
              </Button>
              <Button type="button" variant="outline" className="text-xs uppercase" onClick={() => goToProduct(nextId)}>
                Next
              </Button>
            </div>
          )}
        </div>
      </div>

      {sizeOpen && hasSizes && <SizeSelector sizes={sizes} price={product.price} onSelect={handleSizeSelect} onClose={() => setSizeOpen(false)} />}
    </div>
  );
}

