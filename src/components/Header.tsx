import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { APP_NAME, fetchActiveStoreBySlug } from "@/lib/storefront";

export function Header() {
  const { totalItems } = useCart();
  const location = useLocation();
  const storeSlug = location.pathname.match(/^\/s\/([^/]+)/)?.[1];

  const { data: store } = useQuery({
    queryKey: ["header-store", storeSlug],
    enabled: !!storeSlug,
    queryFn: () => fetchActiveStoreBySlug(storeSlug!),
  });

  return (
    <header className="sticky top-0 z-50 bg-background border-b border-border">
      <div className="flex items-center justify-between px-4 py-3 md:px-8">
        {store ? (
          <Link to="/s/$slug" params={{ slug: store.slug }} className="text-lg font-bold tracking-[0.18em] uppercase">
            {store.name}
          </Link>
        ) : (
          <Link to="/" className="text-lg font-bold tracking-[0.18em] uppercase">
            {APP_NAME}
          </Link>
        )}
        <Link to="/cart" className="relative">
          <ShoppingBag className="h-5 w-5" />
          {totalItems > 0 && (
            <span className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {totalItems}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
