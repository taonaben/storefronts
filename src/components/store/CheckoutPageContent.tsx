import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import { formatSelectedOptions } from "@/lib/productTypes";

export function CheckoutPageContent({ storeSlug }: { storeSlug?: string }) {
  const { items, subtotal, clearCart } = useCart();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", city: "", address: "" });
  const storeId = items[0]?.store_id;

  const { data: store } = useQuery({
    queryKey: ["checkout-store", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, name, slug, order_notification_phone").eq("id", storeId).single();
      if (error) throw error;
      return data;
    },
  });
  const activeSlug = storeSlug ?? store?.slug;

  useEffect(() => {
    if (!storeSlug || !store || store.slug === storeSlug) return;
    navigate({ to: "/s/$slug/checkout", params: { slug: store.slug }, replace: true });
  }, [navigate, store, storeSlug]);

  useEffect(() => {
    if (items.length > 0) return;
    if (activeSlug) navigate({ to: "/s/$slug/cart", params: { slug: activeSlug }, replace: true });
    else navigate({ to: "/cart", replace: true });
  }, [activeSlug, items.length, navigate]);

  const { data: zones, isLoading: zonesLoading } = useQuery({
    queryKey: ["delivery_zones", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("delivery_zones").select("*").eq("store_id", storeId).eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
  });
  const hasDeliveryZones = (zones?.length ?? 0) > 0;

  if (items.length === 0) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || !form.name.trim() || !form.phone.trim() || !form.email.trim() || !form.address.trim()) return;
    if (hasDeliveryZones && !form.city) return;
    setSubmitting(true);

    try {
      const orderItems = items.map((item) => ({
        id: item.id,
        variant_id: item.variant_id || item.size_id || null,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        selected_options: item.selected_options || (item.size ? { Size: item.size } : null),
      }));

      const { error } = await supabase.from("orders").insert({
        store_id: storeId,
        customer_name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        city: hasDeliveryZones ? form.city : "",
        address: form.address.trim(),
        items: orderItems,
        total: subtotal,
      } as any);
      if (error) throw error;

      const lines = items.map((item) => {
        const optionText = formatSelectedOptions(item.selected_options) || (item.size ? `Size: ${item.size}` : "");
        const optionsStr = optionText ? ` (${optionText})` : "";
        return `${item.quantity}x ${item.name}${optionsStr} - $${(item.price * item.quantity).toFixed(2)}`;
      });
      const customerLines = [
        `Name: ${form.name}`,
        `Phone: ${form.phone}`,
        `Email: ${form.email}`,
        ...(hasDeliveryZones ? [`City: ${form.city}`] : []),
        `Address: ${form.address}`,
      ];
      const msg = `New ${store?.name ?? "store"} order\n\n` +
        `${customerLines.join("\n")}\n\n` +
        `Items:\n${lines.join("\n")}\n\nTotal: $${subtotal.toFixed(2)}`;
      const phone = store?.order_notification_phone?.replace(/\D/g, "");

      clearCart();
      if (phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
      if (store?.slug) navigate({ to: "/s/$slug", params: { slug: store.slug } });
      else navigate({ to: "/" });
    } catch {
      alert("Failed to place order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6 md:px-8">
      <h1 className="mb-6 text-sm font-bold uppercase tracking-wider">Checkout</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Full Name</label>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className="mt-1" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Phone Number</label>
          <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} required className="mt-1" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Email</label>
          <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required className="mt-1" />
        </div>
        {hasDeliveryZones && (
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">City</label>
            <Select value={form.city} onValueChange={(value) => setForm((f) => ({ ...f, city: value }))}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select delivery city" />
              </SelectTrigger>
              <SelectContent>
                {zones?.map((zone) => (
                  <SelectItem key={zone.id} value={zone.name}>{zone.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Delivery Address</label>
          <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} required className="mt-1" />
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <span className="text-xs uppercase tracking-wider">Total</span>
          <span className="text-sm font-bold">${subtotal.toFixed(2)}</span>
        </div>

        <Button type="submit" disabled={submitting || zonesLoading || (hasDeliveryZones && !form.city)} className="h-11 w-full text-xs uppercase tracking-widest">
          {submitting ? "Placing order..." : "Place Order"}
        </Button>
      </form>
    </div>
  );
}
