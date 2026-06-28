import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/admin/Field";
import { useAdminStores, slugify } from "@/hooks/useAdminStores";

export const Route = createFileRoute("/admin/stores")({
  component: AdminStores,
});

function AdminStores() {
  const qc = useQueryClient();
  const { user, stores, selectedStoreId, setSelectedStoreId, isLoading } = useAdminStores();
  const [form, setForm] = useState({ name: "", slug: "", order_notification_phone: "" });

  const createStore = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("You must be signed in to create a store.");
      const slug = form.slug.trim() || slugify(form.name);
      const { data, error } = await supabase
        .from("stores")
        .insert({
          owner_id: user.id,
          name: form.name.trim(),
          slug,
          order_notification_phone: form.order_notification_phone.trim() || null,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async (storeId) => {
      await qc.invalidateQueries({ queryKey: ["owned-stores", user?.id] });
      setSelectedStoreId(storeId);
      setForm({ name: "", slug: "", order_notification_phone: "" });
    },
  });

  const updateStore = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("stores").update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owned-stores", user?.id] }),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading...</p>;

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider mb-4">Stores</h2>
        {stores.length === 0 ? (
          <p className="text-xs text-muted-foreground mb-4">Create your first store to start adding products.</p>
        ) : (
          <div className="space-y-3">
            {stores.map((store) => (
              <div
                key={store.id}
                className="border border-border p-3 space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider">{store.name}</p>
                    <p className="text-[10px] text-muted-foreground">/s/{store.slug}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Active</span>
                    <Switch
                      checked={store.active}
                      onCheckedChange={(active) => updateStore.mutate({ id: store.id, patch: { active } })}
                    />
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-start">
                  <Field label="Store Name" helper="Shown on your storefront.">
                    <Input
                      placeholder="store name"
                      defaultValue={store.name}
                      onBlur={(e) => {
                        const name = e.target.value.trim();
                        if (name && name !== store.name) updateStore.mutate({ id: store.id, patch: { name } });
                      }}
                    />
                  </Field>
                  <Field label="Order Text Number" helper="Receives WhatsApp order messages.">
                    <Input
                      placeholder="0781234567"
                      defaultValue={store.order_notification_phone ?? ""}
                      onBlur={(e) => {
                        const phone = e.target.value.trim() || null;
                        if (phone !== store.order_notification_phone) updateStore.mutate({ id: store.id, patch: { order_notification_phone: phone } });
                      }}
                    />
                  </Field>
                  <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:pt-[22px]">
                    <Button
                      type="button"
                      variant={selectedStoreId === store.id ? "default" : "outline"}
                      className="text-xs uppercase"
                      onClick={() => setSelectedStoreId(store.id)}
                    >
                      {selectedStoreId === store.id ? "Selected" : "Select"}
                    </Button>
                    <Button asChild type="button" variant="outline" className="text-xs uppercase">
                      <Link to="/s/$slug" params={{ slug: store.slug }}>
                        Go to Store
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider mb-4">Create Store</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createStore.mutate();
          }}
          className="grid gap-3 md:grid-cols-[1fr_1fr]"
        >
          <Field label="Store Name" helper="Shown on your storefront.">
            <Input
              placeholder="store name"
              value={form.name}
              onChange={(e) => setForm((current) => ({ ...current, name: e.target.value, slug: current.slug || slugify(e.target.value) }))}
              required
            />
          </Field>
          <Field label="Store Link" helper="Used in /s/your-store-link.">
            <Input
              placeholder="store-link"
              value={form.slug}
              onChange={(e) => setForm((current) => ({ ...current, slug: slugify(e.target.value) }))}
              required
            />
          </Field>
          <Field label="Order Text Number" helper="Receives WhatsApp order messages.">
            <Input
              placeholder="0781234567"
              value={form.order_notification_phone}
              onChange={(e) => setForm((current) => ({ ...current, order_notification_phone: e.target.value }))}
            />
          </Field>
          <div className="flex items-center md:pt-[22px]">
            <Button type="submit" disabled={createStore.isPending || stores.length >= 3} className="h-9 w-full text-xs uppercase tracking-widest">
              {stores.length >= 3 ? "Store Limit Reached" : createStore.isPending ? "Creating..." : "Create Store"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
