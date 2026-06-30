import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StoreClosedMessage } from "@/components/store/StoreClosedMessage";
import { useCart } from "@/contexts/CartContext";
import { formatSelectedOptions } from "@/lib/productTypes";
import { fetchStoreById } from "@/lib/storefront";

export function CartPageContent({ storeSlug }: { storeSlug?: string }) {
  const { items, updateQuantity, removeItem, subtotal } = useCart();
  const navigate = useNavigate();
  const storeId = items[0]?.store_id;
  const { data: store } = useQuery({
    queryKey: ["cart-store", storeId],
    enabled: !!storeId,
    queryFn: () => fetchStoreById(storeId!),
  });
  const activeSlug = storeSlug ?? store?.slug;

  useEffect(() => {
    if (!storeSlug || !store || store.slug === storeSlug) return;
    navigate({ to: "/s/$slug/cart", params: { slug: store.slug }, replace: true });
  }, [navigate, store, storeSlug]);

  if (items.length === 0) {
    return (
      <div className="px-4 py-20 text-center">
        <p className="text-sm text-muted-foreground">Your cart is empty.</p>
        {activeSlug ? (
          <Link to="/s/$slug" params={{ slug: activeSlug }} className="mt-2 inline-block text-xs underline">Continue shopping</Link>
        ) : (
          <Link to="/" className="mt-2 inline-block text-xs underline">Find a store</Link>
        )}
      </div>
    );
  }

  if (store && !store.active) return <StoreClosedMessage storeName={store.name} />;

  return (
    <div className="mx-auto max-w-lg px-4 py-6 md:px-8">
      <h1 className="mb-6 text-sm font-bold uppercase tracking-wider">Cart</h1>
      <div className="space-y-4">
        {items.map((item) => {
          const variantId = item.variant_id || item.size_id;
          const optionText = formatSelectedOptions(item.selected_options) || (item.size ? `Size: ${item.size}` : "");

          return (
          <div key={`${item.id}-${variantId ?? "no-variant"}`} className="flex gap-3">
            <div className="h-20 w-20 shrink-0 overflow-hidden bg-secondary">
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[8px] uppercase text-muted-foreground">No img</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium uppercase tracking-wider">{item.name}</p>
              {optionText && <p className="text-[10px] text-muted-foreground">{optionText}</p>}
              <p className="mt-0.5 text-xs text-muted-foreground">${item.price.toFixed(2)}</p>
              <div className="mt-2 flex items-center gap-2">
                <button onClick={() => updateQuantity(item.id, item.quantity - 1, variantId)} className="text-muted-foreground hover:text-foreground">
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-6 text-center text-xs">{item.quantity}</span>
                <button onClick={() => updateQuantity(item.id, item.quantity + 1, variantId)} className="text-muted-foreground hover:text-foreground">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
            <button onClick={() => removeItem(item.id, variantId)} className="self-start text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
        })}
      </div>
      <div className="mt-6 flex items-center justify-between border-t pt-4">
        <span className="text-xs uppercase tracking-wider">Subtotal</span>
        <span className="text-sm font-bold">${subtotal.toFixed(2)}</span>
      </div>

      <div className="mt-4 grid gap-2">
        {activeSlug ? (
          <Link to="/s/$slug/checkout" params={{ slug: activeSlug }}>
            <Button className="h-11 w-full text-xs uppercase tracking-widest">Checkout</Button>
          </Link>
        ) : (
          <Button className="h-11 w-full text-xs uppercase tracking-widest" disabled>Checkout</Button>
        )}
        {activeSlug ? (
          <Link to="/s/$slug" params={{ slug: activeSlug }} className="text-center text-xs underline">
            Continue shopping
          </Link>
        ) : (
          <Link to="/" className="text-center text-xs underline">Find a store</Link>
        )}
      </div>
    </div>
  );
}
