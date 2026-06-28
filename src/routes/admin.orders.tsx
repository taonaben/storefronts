import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminStores } from "@/hooks/useAdminStores";
import type { Enums } from "@/integrations/supabase/types";
import { formatSelectedOptions } from "@/lib/productTypes";

export const Route = createFileRoute("/admin/orders")({
  component: AdminOrders,
});

function AdminOrders() {
  const qc = useQueryClient();
  const { selectedStore, selectedStoreId, isLoading: storesLoading } = useAdminStores();

  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin-orders", selectedStoreId],
    enabled: !!selectedStoreId,
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*").eq("store_id", selectedStoreId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Enums<"order_status"> }) => {
      const { error } = await supabase.from("orders").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-orders", selectedStoreId] }),
  });

  if (storesLoading || isLoading) return <p className="text-xs text-muted-foreground">Loading...</p>;
  if (!selectedStore) return <p className="text-xs text-muted-foreground">Create a store before viewing orders.</p>;

  return (
    <div className="max-w-3xl">
      <h2 className="text-sm font-bold uppercase tracking-wider mb-4">Orders - {selectedStore.name}</h2>
      {orders?.length === 0 ? (
        <p className="text-xs text-muted-foreground">No orders yet.</p>
      ) : (
        <div className="space-y-3">
          {orders?.map((order) => {
            const items = Array.isArray(order.items) ? order.items : [];
            return (
              <div key={order.id} className="border border-border p-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium">{order.customer_name}</p>
                    <p className="text-[10px] text-muted-foreground">{order.phone} - {order.email} - {order.city}</p>
                    <p className="text-[10px] text-muted-foreground">{order.address}</p>
                    <div className="mt-1">
                      {items.map((item: any, i: number) => {
                        const optionText = formatSelectedOptions(item.selected_options) || (item.size ? `Size: ${item.size}` : "");
                        return (
                          <div key={i} className="text-[10px]">
                            <p>{item.quantity}x {item.name} - ${(item.price * item.quantity).toFixed(2)}</p>
                            {optionText && <p className="text-muted-foreground">{optionText}</p>}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs font-bold mt-1">Total: ${order.total}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(order.created_at).toLocaleString()}</p>
                  </div>
                  <Select value={order.status} onValueChange={(v) => updateStatus.mutate({ id: order.id, status: v as Enums<"order_status"> })}>
                    <SelectTrigger className="w-28 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
