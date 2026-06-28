import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { useAdminStores, slugify } from "@/hooks/useAdminStores";
import { Field } from "@/components/admin/Field";

export const Route = createFileRoute("/admin/categories")({
  component: AdminCategories,
});

function AdminCategories() {
  const qc = useQueryClient();
  const { selectedStore, selectedStoreId, isLoading: storesLoading } = useAdminStores();
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");

  const { data: categories, isLoading } = useQuery({
    queryKey: ["categories", selectedStoreId],
    enabled: !!selectedStoreId,
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").eq("store_id", selectedStoreId).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selectedStoreId) throw new Error("Select a store before adding categories.");
      const slug = slugify(name);
      const { error } = await supabase.from("categories").insert({ store_id: selectedStoreId, name: name.trim(), slug, sort_order: parseInt(sortOrder) } as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["categories", selectedStoreId] }); setName(""); setSortOrder("0"); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories", selectedStoreId] }),
  });

  if (storesLoading) return <p className="text-xs text-muted-foreground">Loading...</p>;
  if (!selectedStore) return <p className="text-xs text-muted-foreground">Create a store before adding categories.</p>;

  return (
    <div className="max-w-md">
      <h2 className="text-sm font-bold uppercase tracking-wider mb-4">Categories - {selectedStore.name}</h2>
      <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(); }} className="grid gap-2 md:grid-cols-[1fr_7rem_auto] mb-6">
        <Field label="Category Name">
          <Input placeholder="Sneakers" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Sort Order" helper="Lower first.">
          <Input placeholder="0" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </Field>
        <Button type="submit" disabled={addMutation.isPending} className="self-end text-xs uppercase">Add</Button>
      </form>
      {isLoading ? <p className="text-xs text-muted-foreground">Loading…</p> : (
        <div className="space-y-2">
          {categories?.map((c) => (
            <div key={c.id} className="flex items-center justify-between border border-border p-2">
              <div>
                <p className="text-xs font-medium">{c.name}</p>
                <p className="text-[10px] text-muted-foreground">/{c.slug} · order: {c.sort_order}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(c.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
