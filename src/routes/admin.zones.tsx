import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminStores } from "@/hooks/useAdminStores";
import { Field } from "@/components/admin/Field";

export const Route = createFileRoute("/admin/zones")({
  component: AdminZones,
});

function AdminZones() {
  const qc = useQueryClient();
  const { selectedStore, selectedStoreId, isLoading: storesLoading } = useAdminStores();
  const [name, setName] = useState("");

  const { data: zones, isLoading } = useQuery({
    queryKey: ["admin-zones", selectedStoreId],
    enabled: !!selectedStoreId,
    queryFn: async () => {
      const { data, error } = await supabase.from("delivery_zones").select("*").eq("store_id", selectedStoreId).order("name");
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selectedStoreId) throw new Error("Select a store before adding delivery zones.");
      const { error } = await supabase.from("delivery_zones").insert({ store_id: selectedStoreId, name: name.trim(), active: true } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-zones", selectedStoreId] });
      setName("");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("delivery_zones").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-zones", selectedStoreId] }),
  });

  if (storesLoading || isLoading) return <p className="text-xs text-muted-foreground">Loading...</p>;
  if (!selectedStore) return <p className="text-xs text-muted-foreground">Create a store before adding delivery zones.</p>;

  return (
    <div className="max-w-md">
      <h2 className="text-sm font-bold uppercase tracking-wider mb-4">Delivery Zones - {selectedStore.name}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addMutation.mutate();
        }}
        className="grid gap-2 md:grid-cols-[1fr_auto] mb-6"
      >
        <Field label="Delivery Zone" helper="Customers choose from active zones at checkout.">
          <Input placeholder="Harare" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Button type="submit" disabled={addMutation.isPending} className="self-end text-xs uppercase">Add</Button>
      </form>
      <div className="space-y-2">
        {zones?.map((z) => (
          <div key={z.id} className="flex items-center justify-between border border-border p-3">
            <span className="text-xs font-medium">{z.name}</span>
            <Switch checked={z.active} onCheckedChange={(checked) => toggleMutation.mutate({ id: z.id, active: checked })} />
          </div>
        ))}
      </div>
    </div>
  );
}
