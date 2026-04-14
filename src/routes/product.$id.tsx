import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/contexts/CartContext";
import { ArrowLeft, ChevronLeft, ChevronRight, X, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useRef, useCallback, useEffect } from "react";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/product/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    cat: (search.cat as string) || undefined,
  }),
  head: () => ({
    meta: [
      { title: "Product — SneakersPlug" },
      { name: "description", content: "View product details at SneakersPlug." },
    ],
  }),
  component: ProductDetail,
});

/* ── Size selector overlay (YZY-style) ── */
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
      <div
        className="w-full max-w-lg bg-background px-6 pt-5 pb-8 animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setShowAlt(!showAlt)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Toggle size format"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <span className="text-xs font-bold uppercase tracking-[0.2em]">Select Size</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Price */}
        <p className="text-center text-sm font-medium mb-4">${price.toFixed(2)}</p>

        {/* Size grid */}
        <div className="grid grid-cols-7 gap-2">
          {sizes.map((s) => {
            const oos = s.stock <= 0;
            const displayLabel = showAlt && s.alt_label ? s.alt_label : s.label;
            return (
              <button
                key={s.id}
                disabled={oos}
                onClick={() => onSelect(s)}
                className={`py-2 text-xs font-medium uppercase tracking-wider transition-colors ${
                  oos
                    ? "text-muted-foreground/40 cursor-not-allowed line-through"
                    : "text-foreground hover:bg-foreground hover:text-background"
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

/* ── Main product detail ── */
function ProductDetail() {
  const { id } = Route.useParams();
  const { cat } = Route.useSearch();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [sizeOpen, setSizeOpen] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [slideDir, setSlideDir] = useState<"up" | "down" | null>(null);

  // Touch refs
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndX = useRef(0);
  const touchEndY = useRef(0);
  const hasSwiped = useRef(false);

  // Fetch current product
  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch extra images
  const { data: extraImages } = useQuery({
    queryKey: ["product-images", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_images").select("*").eq("product_id", id).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // Build full image list: main image first, then extras
  const allImages: string[] = [];
  if (product?.image_url) allImages.push(product.image_url);
  if (extraImages) {
    for (const img of extraImages) allImages.push(img.image_url);
  }
  if (allImages.length === 0) allImages.push(""); // placeholder for "no image"

  // Reset image index when product changes
  useEffect(() => {
    setImageIndex(0);
  }, [id]);

  // Fetch sizes for this product
  const { data: sizes } = useQuery({
    queryKey: ["product-sizes", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_sizes").select("*").eq("product_id", id).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // Fetch sibling products for navigation (same category if cat param, otherwise all)
  const { data: siblings } = useQuery({
    queryKey: ["product-siblings", cat || "all"],
    queryFn: async () => {
      let query = supabase.from("products").select("id").order("created_at", { ascending: false });
      if (cat) query = query.eq("category_id", cat);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Determine prev/next product
  const currentIndex = siblings?.findIndex((p) => p.id === id) ?? -1;
  const prevId = siblings && currentIndex > 0 ? siblings[currentIndex - 1].id : siblings && siblings.length > 0 ? siblings[siblings.length - 1].id : null;
  const nextId = siblings && currentIndex < (siblings.length - 1) ? siblings[currentIndex + 1].id : siblings && siblings.length > 0 ? siblings[0].id : null;

  const goToProduct = useCallback(
    (targetId: string | null, dir: "up" | "down") => {
      if (!targetId || targetId === id) return;
      setSlideDir(dir);
      navigate({ to: "/product/$id", params: { id: targetId }, search: { cat } });
    },
    [navigate, id, cat],
  );

  // Prefetch next/prev product images
  useEffect(() => {
    if (!siblings) return;
    const idsToPreload = [prevId, nextId].filter(Boolean) as string[];
    for (const pid of idsToPreload) {
      supabase.from("products").select("image_url").eq("id", pid).single().then(({ data }) => {
        if (data?.image_url) {
          const img = new window.Image();
          img.src = data.image_url;
        }
      });
    }
  }, [siblings, prevId, nextId]);

  // Mouse wheel → navigate products
  useEffect(() => {
    let wheelTimeout: ReturnType<typeof setTimeout> | null = null;
    const handler = (e: WheelEvent) => {
      if (sizeOpen) return;
      if (wheelTimeout) return; // debounce
      if (Math.abs(e.deltaY) < 30) return;
      e.preventDefault();
      wheelTimeout = setTimeout(() => { wheelTimeout = null; }, 400);
      if (e.deltaY > 0) goToProduct(nextId, "up");
      else goToProduct(prevId, "down");
    };
    window.addEventListener("wheel", handler, { passive: false });
    return () => window.removeEventListener("wheel", handler);
  }, [prevId, nextId, goToProduct, sizeOpen]);

  const goToImage = useCallback(
    (dir: "prev" | "next") => {
      setImageIndex((cur) => {
        if (dir === "next") return cur < allImages.length - 1 ? cur + 1 : 0;
        return cur > 0 ? cur - 1 : allImages.length - 1;
      });
    },
    [allImages.length],
  );

  // Keyboard nav: left/right = images, up/down = products
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (sizeOpen) return;
      if (e.key === "ArrowLeft") goToImage("prev");
      if (e.key === "ArrowRight") goToImage("next");
      if (e.key === "ArrowUp") { e.preventDefault(); goToProduct(prevId, "down"); }
      if (e.key === "ArrowDown") { e.preventDefault(); goToProduct(nextId, "up"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [prevId, nextId, goToProduct, goToImage, sizeOpen]);

  // Touch handlers: horizontal = images, vertical = products
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
    hasSwiped.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
    hasSwiped.current = true;
    // Prevent pull-to-refresh / native scroll when vertical swipe detected
    const dy = Math.abs(touchEndY.current - touchStartY.current);
    const dx = Math.abs(touchEndX.current - touchStartX.current);
    if (dy > 10 || dx > 10) e.preventDefault();
  };
  const onTouchEnd = () => {
    if (!hasSwiped.current) return;
    const dx = touchStartX.current - touchEndX.current;
    const dy = touchStartY.current - touchEndY.current;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Determine dominant axis
    if (absDx > absDy && absDx > 50) {
      // Horizontal swipe → cycle images
      if (dx > 0) goToImage("next");
      else goToImage("prev");
    } else if (absDy > absDx && absDy > 80) {
      // Vertical swipe → navigate products
      if (dy > 0) goToProduct(nextId, "up"); // swipe up → next product
      else goToProduct(prevId, "down"); // swipe down → prev product
    }
  };

  const hasSizes = sizes && sizes.length > 0;
  const totalSizeStock = hasSizes ? sizes.reduce((sum, s) => sum + s.stock, 0) : 0;
  const isInStock = hasSizes ? totalSizeStock > 0 : (product?.stock ?? 0) > 0;

  const handleAddToCart = () => {
    if (!product) return;
    if (hasSizes) {
      setSizeOpen(true);
    } else {
      addItem({ id: product.id, name: product.name, price: product.price, image_url: product.image_url });
    }
  };

  const handleSizeSelect = (size: Tables<"product_sizes">) => {
    if (!product) return;
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image_url: product.image_url,
      size: size.label,
      size_id: size.id,
    });
    setSizeOpen(false);
  };

  if (isLoading) {
    return (
      <div className="px-4 py-6 md:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="aspect-square bg-secondary animate-pulse" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="px-4 py-20 text-center">
        <p className="text-muted-foreground text-sm">Product not found.</p>
        <Link to="/" className="text-xs underline mt-2 inline-block">Back to shop</Link>
      </div>
    );
  }

  const currentImage = allImages[imageIndex];
  const hasMultipleImages = allImages.length > 1;

  return (
    <div
      className="relative px-4 py-6 md:px-8 h-[calc(100vh-57px)] overflow-hidden overscroll-none touch-none"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Back link */}
      <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-3 w-3" /> Back
      </Link>

      {/* Desktop image arrows (left/right) */}
      {hasMultipleImages && (
        <>
          <button
            onClick={() => goToImage("prev")}
            className="hidden md:flex fixed left-6 top-1/2 -translate-y-1/2 z-30 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-8 w-8" />
          </button>
          <button
            onClick={() => goToImage("next")}
            className="hidden md:flex fixed right-6 top-1/2 -translate-y-1/2 z-30 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Next image"
          >
            <ChevronRight className="h-8 w-8" />
          </button>
        </>
      )}



      {/* Mobile: stacked layout */}
      <div className="md:hidden max-w-lg mx-auto">
        <div
          key={`${id}-img-mobile`}
          className={`relative aspect-square bg-secondary overflow-hidden ${
            slideDir === "up" ? "animate-slide-up" : slideDir === "down" ? "animate-slide-down" : ""
          }`}
          onAnimationEnd={() => setSlideDir(null)}
        >
          {currentImage ? (
            <img src={currentImage} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs uppercase tracking-widest">No image</div>
          )}
          {hasMultipleImages && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
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
        <div className="mt-4">
          <h1 className="text-sm font-bold uppercase tracking-wider">{product.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">${product.price.toFixed(2)}</p>
          {isInStock ? (
            <Button onClick={handleAddToCart} className="w-full mt-6 uppercase tracking-widest text-xs h-11">
              Add to Cart
            </Button>
          ) : (
            <p className="text-xs text-destructive mt-4 uppercase tracking-wider">Out of stock</p>
          )}
        </div>
      </div>

      {/* Desktop: side-by-side layout */}
      <div className="hidden md:flex items-center justify-center gap-12 h-[calc(100%-2rem)] max-w-5xl mx-auto">
        <div
          key={`${id}-img-desktop`}
          className={`relative bg-secondary overflow-hidden flex-shrink-0 h-[min(70vh,560px)] aspect-square ${
            slideDir === "up" ? "animate-slide-up" : slideDir === "down" ? "animate-slide-down" : ""
          }`}
          onAnimationEnd={() => setSlideDir(null)}
        >
          {currentImage ? (
            <img src={currentImage} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs uppercase tracking-widest">No image</div>
          )}
          {hasMultipleImages && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
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
        <div className="flex flex-col justify-center min-w-[200px]">
          <h1 className="text-sm font-bold uppercase tracking-wider">{product.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">${product.price.toFixed(2)}</p>
          {isInStock ? (
            <Button onClick={handleAddToCart} className="w-full mt-6 uppercase tracking-widest text-xs h-11">
              Add to Cart
            </Button>
          ) : (
            <p className="text-xs text-destructive mt-4 uppercase tracking-wider">Out of stock</p>
          )}
        </div>
      </div>

      {/* Size selector overlay */}
      {sizeOpen && hasSizes && (
        <SizeSelector
          sizes={sizes}
          price={product.price}
          onSelect={handleSizeSelect}
          onClose={() => setSizeOpen(false)}
        />
      )}
    </div>
  );
}
