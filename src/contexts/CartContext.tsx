import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface CartItem {
  id: string;
  store_id: string;
  name: string;
  price: number;
  image_url: string | null;
  quantity: number;
  variant_id?: string;
  selected_options?: Record<string, string>;
  size?: string;
  size_id?: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (id: string, variant_id?: string) => void;
  updateQuantity: (id: string, quantity: number, variant_id?: string) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
}

const CartContext = createContext<CartContextType | null>(null);

const CART_KEY = "storefront_cart";
const LEGACY_CART_KEY = "sneakersplug_cart";

function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    const legacyRaw = localStorage.getItem(LEGACY_CART_KEY);
    const parsed = raw ? JSON.parse(raw) : legacyRaw ? JSON.parse(legacyRaw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      const selected_options = item.selected_options || (item.size ? { Size: item.size } : undefined);
      return {
        ...item,
        variant_id: item.variant_id || item.size_id,
        selected_options,
      };
    });
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => loadCart());

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = (item: Omit<CartItem, "quantity">) => {
    setItems((prev) => {
      const sameStoreItems = prev.filter((i) => i.store_id === item.store_id);
      const existing = prev.find((i) => i.id === item.id && (i.variant_id || i.size_id) === (item.variant_id || item.size_id));
      if (existing) {
        return prev.map((i) => (i.id === item.id && (i.variant_id || i.size_id) === (item.variant_id || item.size_id) ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...sameStoreItems, { ...item, quantity: 1 }];
    });
  };

  const removeItem = (id: string, variant_id?: string) => {
    setItems((prev) => prev.filter((i) => !(i.id === id && (i.variant_id || i.size_id) === variant_id)));
  };

  const updateQuantity = (id: string, quantity: number, variant_id?: string) => {
    if (quantity < 1) {
      removeItem(id, variant_id);
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === id && (i.variant_id || i.size_id) === variant_id ? { ...i, quantity } : i)));
  };

  const clearCart = () => setItems([]);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, totalItems, subtotal }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
