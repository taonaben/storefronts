import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StoreClosedMessage } from "@/components/store/StoreClosedMessage";
import { useCart } from "@/contexts/CartContext";
import type { Tables } from "@/integrations/supabase/types";
import { fetchStoreBySlug } from "@/lib/storefront";
import { formatSelectedOptions, parseAttributes, selectedOptionsFromJson } from "@/lib/productTypes";
import { shareProduct } from "@/lib/productShare";
import { getProductListKey, useProductStore, type ProductOptionWithValues } from "@/state/product_store";

export const Route = createFileRoute("/s/$slug/product/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    cat: (search.cat as string) || undefined,
  }),
  head: ({ params }) => {
    const title = `${params.slug} - Product`;
    const description = "View this store product.";
    const meta = [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "product" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ];

    return { meta };
  },
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

function VariantSelector({
  options,
  variants,
  selectedOptions,
  onSelectOption,
  onAdd,
  canAdd,
  price,
  onClose,
}: {
  options: ProductOptionWithValues[];
  variants: Tables<"product_variants">[];
  selectedOptions: Record<string, string>;
  onSelectOption: (name: string, value: string) => void;
  onAdd: () => void;
  canAdd: boolean;
  price: number;
  onClose: () => void;
}) {
  const hasSelectedAll = options.every((option) => selectedOptions[option.name]);

  const hasStockForChoice = (optionName: string, value: string) => {
    const nextSelection = { ...selectedOptions, [optionName]: value };
    return variants.some((variant) => {
      if (!variant.active || variant.stock <= 0) return false;
      const variantOptions = selectedOptionsFromJson(variant.selected_options);
      return Object.entries(nextSelection).every(([name, selectedValue]) => variantOptions[name] === selectedValue);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3" onClick={onClose}>
      <div className="w-full max-w-lg animate-in slide-in-from-bottom bg-background px-4 pb-6 pt-5 duration-200 sm:px-6 sm:pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <span className="w-4" />
          <span className="text-xs font-bold uppercase tracking-[0.2em]">Select Options</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 text-center text-sm font-medium">${price.toFixed(2)}</p>

        <div className="space-y-4">
          {options.map((option) => (
            <div key={option.id}>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{option.name}</p>
              <div className="flex flex-wrap gap-2">
                {option.values.map((value) => {
                  const selected = selectedOptions[option.name] === value.value;
                  const disabled = !hasStockForChoice(option.name, value.value);
                  return (
                    <button
                      key={value.id}
                      disabled={disabled}
                      onClick={() => onSelectOption(option.name, value.value)}
                      className={`border px-3 py-2 text-xs font-medium uppercase tracking-wider transition-colors ${
                        selected
                          ? "border-foreground bg-foreground text-background"
                          : disabled
                            ? "cursor-not-allowed border-border text-muted-foreground/40 line-through"
                            : "border-border text-foreground hover:border-foreground"
                      }`}
                    >
                      {value.value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <Button onClick={onAdd} disabled={!hasSelectedAll || !canAdd} className="mt-6 h-11 w-full text-xs uppercase tracking-widest">
          Add to Cart
        </Button>
      </div>
    </div>
  );
}

function StoreProductDetail() {
  const { slug, id } = Route.useParams();
  const { cat } = Route.useSearch();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [optionOpen, setOptionOpen] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [imageIndex, setImageIndex] = useState(0);
  const [slideDir, setSlideDir] = useState<"up" | "down" | null>(null);
  const [productMissing, setProductMissing] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndX = useRef(0);
  const touchEndY = useRef(0);
  const hasSwiped = useRef(false);
  const productPageRef = useRef<HTMLDivElement | null>(null);
  const loadProductDetail = useProductStore((state) => state.loadProductDetail);
  const prefetchProductsAhead = useProductStore((state) => state.prefetchProductsAhead);

  const { data: store, isLoading: storeLoading } = useQuery({
    queryKey: ["store", slug],
    queryFn: () => fetchStoreBySlug(slug),
  });

  const productListKey = store?.id && store.active ? getProductListKey(store.id, cat) : null;
  const detail = useProductStore((state) => state.detailsById[id]);
  const detailLoading = useProductStore((state) => state.detailLoadingById[id]);
  const detailError = useProductStore((state) => state.detailErrorsById[id]);
  const siblingIdsFromList = useProductStore((state) => (productListKey ? state.listIdsByKey[productListKey] : undefined));
  const product = detail?.product;
  const extraImages = detail?.images ?? [];
  const options = detail?.options ?? [];
  const variants = detail?.variants ?? [];
  const siblingIds = siblingIdsFromList ?? detail?.siblingIds;

  const allImages: string[] = [];
  if (product?.image_url) allImages.push(product.image_url);
  if (extraImages) {
    for (const image of extraImages) allImages.push(image.image_url);
  }
  if (allImages.length === 0) allImages.push("");

  useEffect(() => {
    setImageIndex(0);
    setSelectedOptions({});
    setProductMissing(false);
  }, [id]);

  useEffect(() => {
    if (!store?.id || !store.active) return;

    let cancelled = false;

    loadProductDetail(store.id, id, cat)
      .then((loadedDetail) => {
        if (cancelled) return;

        if (!loadedDetail) {
          setProductMissing(true);
          return;
        }

        prefetchProductsAhead(store.id, id, cat, 3).catch((error) => {
          console.error("Failed to prefetch products", error);
        });
      })
      .catch((error) => {
        if (!cancelled) console.error("Failed to load product detail", error);
      });

    return () => {
      cancelled = true;
    };
  }, [loadProductDetail, prefetchProductsAhead, store?.id, store?.active, id, cat]);

  const goToImage = useCallback(
    (dir: "prev" | "next") => {
      setImageIndex((current) => {
        if (dir === "next") return current < allImages.length - 1 ? current + 1 : 0;
        return current > 0 ? current - 1 : allImages.length - 1;
      });
    },
    [allImages.length],
  );

  const currentIndex = siblingIds?.findIndex((itemId) => itemId === id) ?? -1;
  const prevId = siblingIds && currentIndex > 0 ? siblingIds[currentIndex - 1] : siblingIds && siblingIds.length > 0 ? siblingIds[siblingIds.length - 1] : null;
  const nextId = siblingIds && currentIndex < siblingIds.length - 1 ? siblingIds[currentIndex + 1] : siblingIds && siblingIds.length > 0 ? siblingIds[0] : null;

  const goToProduct = useCallback(
    (targetId: string | null, dir: "up" | "down") => {
      if (!targetId || targetId === id) return;
      setSlideDir(dir);
      navigate({ to: "/s/$slug/product/$id", params: { slug, id: targetId }, search: { cat } });
    },
    [navigate, slug, id, cat],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (optionOpen) return;
      if (event.key === "ArrowLeft") goToImage("prev");
      if (event.key === "ArrowRight") goToImage("next");
      if (event.key === "ArrowUp") {
        event.preventDefault();
        goToProduct(prevId, "down");
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        goToProduct(nextId, "up");
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goToImage, goToProduct, prevId, nextId, optionOpen]);

  useEffect(() => {
    let wheelTimeout: ReturnType<typeof setTimeout> | null = null;
    const handler = (event: WheelEvent) => {
      if (optionOpen || wheelTimeout) return;
      if (Math.abs(event.deltaY) < 30) return;

      event.preventDefault();
      wheelTimeout = setTimeout(() => {
        wheelTimeout = null;
      }, 400);

      if (event.deltaY > 0) goToProduct(nextId, "up");
      else goToProduct(prevId, "down");
    };

    window.addEventListener("wheel", handler, { passive: false });
    return () => window.removeEventListener("wheel", handler);
  }, [goToProduct, nextId, prevId, optionOpen]);

  useEffect(() => {
    const node = productPageRef.current;
    if (!node) return;

    const preventNativeScroll = (event: TouchEvent) => {
      if (optionOpen || event.touches.length !== 1) return;

      const currentX = event.touches[0].clientX;
      const currentY = event.touches[0].clientY;
      const dx = Math.abs(currentX - touchStartX.current);
      const dy = Math.abs(currentY - touchStartY.current);

      if (dx > 10 || dy > 10) event.preventDefault();
    };

    node.addEventListener("touchmove", preventNativeScroll, { passive: false });
    return () => node.removeEventListener("touchmove", preventNativeScroll);
  }, [optionOpen]);

  const onTouchStart = (event: React.TouchEvent) => {
    if (optionOpen) return;

    touchStartX.current = event.touches[0].clientX;
    touchStartY.current = event.touches[0].clientY;
    touchEndX.current = event.touches[0].clientX;
    touchEndY.current = event.touches[0].clientY;
    hasSwiped.current = false;
  };

  const onTouchMove = (event: React.TouchEvent) => {
    if (optionOpen) return;

    touchEndX.current = event.touches[0].clientX;
    touchEndY.current = event.touches[0].clientY;
    hasSwiped.current = true;

    const dy = Math.abs(touchEndY.current - touchStartY.current);
    const dx = Math.abs(touchEndX.current - touchStartX.current);
    if (dy > 10 || dx > 10) event.preventDefault();
  };

  const onTouchEnd = () => {
    if (optionOpen) return;
    if (!hasSwiped.current) return;

    const dx = touchStartX.current - touchEndX.current;
    const dy = touchStartY.current - touchEndY.current;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx > absDy && absDx > 50) {
      if (dx > 0) goToImage("next");
      else goToImage("prev");
    } else if (absDy > absDx && absDy > 80) {
      if (dy > 0) goToProduct(nextId, "up");
      else goToProduct(prevId, "down");
    }
  };

  const productLoading = !detail && !productMissing && !detailError && (detailLoading || !!store?.id);

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

  if (!store.active) return <StoreClosedMessage storeName={store.name} />;

  if (productLoading) {
    return (
      <div className="px-4 py-6 md:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="aspect-square animate-pulse bg-secondary" />
        </div>
      </div>
    );
  }

  if (detailError) {
    return (
      <div className="px-4 py-20 text-center">
        <p className="text-sm text-muted-foreground">{detailError}</p>
        <Link to="/s/$slug" params={{ slug: store.slug }} className="mt-2 inline-block text-xs underline">Back to store</Link>
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

  const optionGroups = options.filter((option) => option.values.length > 0);
  const hasVariants = optionGroups.length > 0 && variants.length > 0;
  const totalVariantStock = hasVariants ? variants.reduce((sum, variant) => sum + (variant.active ? variant.stock : 0), 0) : 0;
  const selectedVariant = hasVariants
    ? variants.find((variant) => {
        const variantOptions = selectedOptionsFromJson(variant.selected_options);
        return optionGroups.every((option) => variantOptions[option.name] === selectedOptions[option.name]);
      })
    : null;
  const displayPrice = selectedVariant?.price_override ?? product.price;
  const attributes = parseAttributes(product.attributes);
  const isInStock = hasVariants ? totalVariantStock > 0 : product.stock > 0;
  const currentImage = allImages[imageIndex];
  const hasMultipleImages = allImages.length > 1;

  const handleShare = async () => {
    const url = new URL(`/s/${store.slug}/product/${product.id}`, window.location.origin).toString();

    try {
      await shareProduct({
        name: product.name,
        price: displayPrice,
        storeName: store.name,
        imageUrl: currentImage || product.image_url,
        url,
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
    }
  };

  const handleAddToCart = () => {
    if (hasVariants) {
      setOptionOpen(true);
      return;
    }

    addItem({ id: product.id, store_id: product.store_id, name: product.name, price: product.price, image_url: product.image_url });
  };

  const handleVariantAdd = () => {
    if (!selectedVariant || selectedVariant.stock <= 0) return;
    const finalOptions = selectedOptionsFromJson(selectedVariant.selected_options);
    addItem({
      id: product.id,
      store_id: product.store_id,
      name: product.name,
      price: selectedVariant.price_override ?? product.price,
      image_url: product.image_url,
      variant_id: selectedVariant.id,
      selected_options: finalOptions,
    });
    setOptionOpen(false);
  };

  const selectOption = (name: string, value: string) => {
    setSelectedOptions((current) => {
      const next = { ...current, [name]: value };
      const matchingVariant = variants?.find((variant) => {
        if (!variant.active || variant.stock <= 0) return false;
        const variantOptions = selectedOptionsFromJson(variant.selected_options);
        return Object.entries(next).every(([optionName, selectedValue]) => variantOptions[optionName] === selectedValue);
      });

      if (matchingVariant) return next;

      return { [name]: value };
    });
  };

  return (
    <div
      ref={productPageRef}
      className="relative h-[calc(100dvh-57px)] touch-none overflow-hidden overscroll-none px-4 py-5 sm:px-6 md:h-[calc(100vh-57px)] md:px-8 md:py-6"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link to="/s/$slug" params={{ slug: store.slug }} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back
        </Link>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleShare} aria-label={`Share ${product.name}`}>
          <Share2 className="h-4 w-4" />
        </Button>
      </div>

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

      <div className="mx-auto grid h-[calc(100%-2rem)] max-w-5xl grid-rows-[minmax(0,1fr)_auto] gap-5 md:grid-cols-[minmax(280px,560px)_minmax(200px,280px)] md:grid-rows-1 md:items-center md:justify-center md:gap-12">
        <div
          key={`${id}-image`}
          className={`relative mx-auto aspect-square w-full max-w-[min(100%,calc(100dvh-17rem),560px)] overflow-hidden bg-secondary md:max-w-[min(70vh,560px)] ${
            slideDir === "up" ? "animate-slide-up" : slideDir === "down" ? "animate-slide-down" : ""
          }`}
          onAnimationEnd={() => setSlideDir(null)}
        >
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

        <div className="flex min-w-0 flex-col justify-center">
          <h1 className="text-sm font-bold uppercase tracking-wider">{product.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">${displayPrice.toFixed(2)}</p>
          {attributes.length > 0 && (
            <dl className="mt-4 grid gap-2 border-t border-border pt-4">
              {attributes.filter((attribute) => attribute.value).map((attribute) => (
                <div key={attribute.name} className="grid grid-cols-[minmax(5.5rem,7rem)_1fr] gap-3 text-xs">
                  <dt className="uppercase tracking-wider text-muted-foreground">{attribute.name}</dt>
                  <dd className="min-w-0 break-words">{attribute.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {hasVariants && formatSelectedOptions(selectedOptions) && (
            <p className="mt-4 text-xs text-muted-foreground">{formatSelectedOptions(selectedOptions)}</p>
          )}
          {isInStock ? (
            <Button onClick={handleAddToCart} className="mt-6 h-11 w-full text-xs uppercase tracking-widest">
              Add to Cart
            </Button>
          ) : (
            <p className="mt-4 text-xs uppercase tracking-wider text-destructive">Out of stock</p>
          )}
        </div>
      </div>

      {optionOpen && hasVariants && (
        <VariantSelector
          options={optionGroups}
          variants={variants ?? []}
          selectedOptions={selectedOptions}
          onSelectOption={selectOption}
          onAdd={handleVariantAdd}
          canAdd={Boolean(selectedVariant && selectedVariant.stock > 0)}
          price={displayPrice}
          onClose={() => setOptionOpen(false)}
        />
      )}
    </div>
  );
}
