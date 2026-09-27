import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/admin/Field";
import { useAdminStores, slugify } from "@/hooks/useAdminStores";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { shareStore as shareStoreContent } from "@/lib/productShare";
import { STORE_DISPLAY_PICTURE_ACCEPT, uploadStoreDisplayPicture } from "@/lib/storeDisplayPicture";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImageUp, Share2 } from "lucide-react";

export const Route = createFileRoute("/admin/stores")({
  component: AdminStores,
});

function AdminStores() {
  const qc = useQueryClient();
  const { user, stores, selectedStoreId, setSelectedStoreId, isLoading } = useAdminStores();
  const [form, setForm] = useState({ name: "", slug: "", order_notification_phone: "" });
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [debouncedSlug, setDebouncedSlug] = useState("");
  const [slugTaken, setSlugTaken] = useState(false);
  const [displayPictureStoreId, setDisplayPictureStoreId] = useState<string | null>(null);
  const [displayPictureError, setDisplayPictureError] = useState("");
  const [isUpdatingDisplayPicture, setIsUpdatingDisplayPicture] = useState(false);
  const displayPictureInputRef = useRef<HTMLInputElement>(null);
  const displayPictureStore = stores.find((store) => store.id === displayPictureStoreId) ?? null;

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSlug(form.slug.trim()), 350);
    return () => window.clearTimeout(timeout);
  }, [form.slug]);

  useEffect(() => {
    let active = true;

    const checkSlug = async () => {
      if (!debouncedSlug) {
        setSlugTaken(false);
        return;
      }

      const { data, error } = await supabase.from("stores").select("id").eq("slug", debouncedSlug).maybeSingle();
      if (!active) return;
      setSlugTaken(Boolean(!error && data));
    };

    checkSlug();
    return () => {
      active = false;
    };
  }, [debouncedSlug]);

  const createStore = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("You must be signed in to create a store.");
      const slug = form.slug.trim() || slugify(form.name);
      if (slugTaken) throw new Error("That store link is already taken. Try another link.");
      const { data, error } = await supabase
        .from("stores")
        .insert({
          owner_id: user.id,
          name: form.name.trim(),
          slug,
          order_notification_phone: form.order_notification_phone.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async (storeId) => {
      await qc.invalidateQueries({ queryKey: ["owned-stores", user?.id] });
      setSelectedStoreId(storeId);
      setForm({ name: "", slug: "", order_notification_phone: "" });
      setSlugManuallyEdited(false);
    },
  });

  const updateStore = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"stores"> }) => {
      const { error } = await supabase.from("stores").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owned-stores", user?.id] }),
  });

  const shareStore = async (store: (typeof stores)[number]) => {
    const url = new URL(`/s/${store.slug}`, window.location.origin).toString();

    try {
      await shareStoreContent({ name: store.name, url, imageUrl: store.logo_url });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
    }
  };

  const updateDisplayPicture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !displayPictureStore) return;

    try {
      setDisplayPictureError("");
      setIsUpdatingDisplayPicture(true);
      await uploadStoreDisplayPicture(displayPictureStore.id, file);
      await qc.invalidateQueries({ queryKey: ["owned-stores", user?.id] });
    } catch (error) {
      setDisplayPictureError(error instanceof Error ? error.message : "Could not update the display picture.");
    } finally {
      setIsUpdatingDisplayPicture(false);
      event.target.value = "";
    }
  };

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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <button
                      type="button"
                      className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden border border-border bg-secondary text-xs font-bold uppercase transition-opacity hover:opacity-80"
                      onClick={() => setDisplayPictureStoreId(store.id)}
                      aria-label={`View or edit ${store.name} display picture`}
                    >
                      {store.logo_url ? <img src={store.logo_url} alt="" className="h-full w-full object-cover" /> : store.name.slice(0, 1)}
                    </button>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wider">{store.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">/s/{store.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shareStore(store)} aria-label={`Share ${store.name}`}>
                      <Share2 className="h-3.5 w-3.5" />
                    </Button>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Active</span>
                      <Switch
                        checked={store.active}
                        onCheckedChange={(active) => updateStore.mutate({ id: store.id, patch: { active } })}
                      />
                    </div>
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
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center md:flex-nowrap md:pt-[22px]">
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

      <Dialog open={Boolean(displayPictureStore)} onOpenChange={(open) => {
        if (!open) {
          setDisplayPictureStoreId(null);
          setDisplayPictureError("");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="pr-8">
            <DialogTitle className="text-sm uppercase tracking-wider">Store Display Picture</DialogTitle>
            <DialogDescription className="text-xs">This image is shown on your store card and when the store is shared.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center">
            {displayPictureStore?.logo_url ? (
              <img src={displayPictureStore.logo_url} alt={`${displayPictureStore.name} display picture`} className="max-h-80 w-full object-contain" />
            ) : (
              <div className="flex aspect-square w-full max-w-72 items-center justify-center bg-secondary text-4xl font-bold uppercase text-muted-foreground">
                {displayPictureStore?.name.slice(0, 1)}
              </div>
            )}
          </div>
          <input ref={displayPictureInputRef} type="file" accept={STORE_DISPLAY_PICTURE_ACCEPT} className="sr-only" onChange={updateDisplayPicture} />
          {displayPictureError && <p className="text-xs text-destructive">{displayPictureError}</p>}
          <Button type="button" variant="outline" disabled={isUpdatingDisplayPicture} onClick={() => displayPictureInputRef.current?.click()}>
            <ImageUp className="h-4 w-4" /> {isUpdatingDisplayPicture ? "Updating..." : "Edit Picture"}
          </Button>
        </DialogContent>
      </Dialog>

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
              onChange={(e) => {
                const name = e.target.value;
                setForm((current) => ({
                  ...current,
                  name,
                  slug: slugManuallyEdited ? current.slug : slugify(name),
                }));
              }}
              required
            />
          </Field>
          <Field label="Store Link" helper="Used in /s/your-store-link.">
            <Input
              placeholder="store-link"
              value={form.slug}
              onChange={(e) => {
                setSlugManuallyEdited(true);
                setForm((current) => ({ ...current, slug: slugify(e.target.value) }));
              }}
              className={cn(slugTaken && "border-destructive focus-visible:ring-destructive")}
              required
            />
            {slugTaken && <p className="text-xs text-destructive">That store link is taken. Try another link.</p>}
          </Field>
          <Field label="Order Text Number" helper="Receives WhatsApp order messages.">
            <Input
              placeholder="0781234567"
              value={form.order_notification_phone}
              onChange={(e) => setForm((current) => ({ ...current, order_notification_phone: e.target.value }))}
            />
          </Field>
          <div className="flex items-center md:pt-[22px]">
            <Button type="submit" disabled={createStore.isPending || stores.length >= 3 || slugTaken} className="h-9 w-full text-xs uppercase tracking-widest">
              {stores.length >= 3 ? "Store Limit Reached" : createStore.isPending ? "Creating..." : "Create Store"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
