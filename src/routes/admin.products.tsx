import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Image } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { useAdminStores } from "@/hooks/useAdminStores";
import { Field } from "@/components/admin/Field";

export const Route = createFileRoute("/admin/products")({
  component: AdminProducts,
});

interface ProductForm {
  name: string;
  price: string;
  stock: string;
  category_id: string;
}

interface PendingSize {
  label: string;
  altLabel: string;
  stock: string;
}

const emptyForm: ProductForm = { name: "", price: "", stock: "0", category_id: "" };

async function uploadProductImage(storeId: string, productId: string, file: File, label: string) {
  const ext = file.name.split(".").pop();
  const path = `stores/${storeId}/products/${productId}/${Date.now()}_${label}.${ext}`;
  const { error: uploadErr } = await supabase.storage.from("product-images").upload(path, file);
  if (uploadErr) throw uploadErr;
  const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
  return urlData.publicUrl;
}

/* ── Size manager for a single product ── */
function SizeManager({ productId }: { productId: string }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [altLabel, setAltLabel] = useState("");
  const [stock, setStock] = useState("0");

  const { data: sizes } = useQuery({
    queryKey: ["product-sizes", productId],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_sizes").select("*").eq("product_id", productId).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const addSize = useMutation({
    mutationFn: async () => {
      const nextOrder = (sizes?.length ?? 0);
      const { error } = await supabase.from("product_sizes").insert({
        product_id: productId,
        label: label.trim(),
        alt_label: altLabel.trim() || null,
        stock: parseInt(stock),
        sort_order: nextOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-sizes", productId] });
      setLabel("");
      setAltLabel("");
      setStock("0");
    },
  });

  const updateStock = useMutation({
    mutationFn: async ({ id, stock }: { id: string; stock: number }) => {
      const { error } = await supabase.from("product_sizes").update({ stock }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-sizes", productId] }),
  });

  const deleteSize = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_sizes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-sizes", productId] }),
  });

  return (
    <div className="border border-border p-3 mt-3 space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider">Sizes</h3>

      {/* Existing sizes */}
      {sizes && sizes.length > 0 && (
        <div className="space-y-1">
          {sizes.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className="text-xs font-medium w-12">{s.label}</span>
              {s.alt_label && <span className="text-[10px] text-muted-foreground w-12">({s.alt_label})</span>}
              <Field label="Stock" className="w-20">
                <Input
                  type="number"
                  defaultValue={String(s.stock)}
                  className="h-7 text-xs"
                  onBlur={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val !== s.stock) updateStock.mutate({ id: s.id, stock: val });
                  }}
                />
              </Field>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteSize.mutate(s.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add size form */}
      <form onSubmit={(e) => { e.preventDefault(); if (label.trim()) addSize.mutate(); }} className="flex items-center gap-2">
        <Field label="Size" className="w-20">
          <Input placeholder="7" value={label} onChange={(e) => setLabel(e.target.value)} className="h-7 text-xs" required />
        </Field>
        <Field label="Alt" className="w-20">
          <Input placeholder="40" value={altLabel} onChange={(e) => setAltLabel(e.target.value)} className="h-7 text-xs" />
        </Field>
        <Field label="Stock" className="w-16">
          <Input placeholder="0" type="number" value={stock} onChange={(e) => setStock(e.target.value)} className="h-7 text-xs" />
        </Field>
        <Button type="submit" size="sm" className="self-end h-7 text-[10px] uppercase" disabled={addSize.isPending}>Add</Button>
      </form>
    </div>
  );
}

/* ── Image manager for extra product images ── */
function ImageManager({ productId, storeId }: { productId: string; storeId: string }) {
  const qc = useQueryClient();

  const { data: images } = useQuery({
    queryKey: ["product-images", productId],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_images").select("*").eq("product_id", productId).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if ((images?.length ?? 0) >= 3) throw new Error("Each product can only have 3 gallery images.");
      const imageUrl = await uploadProductImage(storeId, productId, file, "gallery");
      const nextOrder = images?.length ?? 0;
      const { error } = await supabase.from("product_images").insert({
        product_id: productId,
        image_url: imageUrl,
        sort_order: nextOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-images", productId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_images").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-images", productId] }),
  });

  return (
    <div className="border border-border p-3 mt-3 space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1">
        <Image className="h-3 w-3" /> Extra Images
      </h3>

      {images && images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative group h-16 w-16 bg-secondary overflow-hidden">
              <img src={img.image_url} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => deleteMutation.mutate(img.id)}
                className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Field label="Gallery Images" helper="Add up to 3 extra images.">
        <Input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            const files = e.target.files;
            if (files) {
              for (const file of Array.from(files)) uploadMutation.mutate(file);
            }
            e.target.value = "";
          }}
          className="text-xs"
        />
      </Field>
      {uploadMutation.isPending && <p className="text-[10px] text-muted-foreground">Uploading…</p>}
    </div>
  );
}

/* ── Main admin products page ── */
function AdminProducts() {
  const qc = useQueryClient();
  const { selectedStore, selectedStoreId, isLoading: storesLoading } = useAdminStores();
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingSizes, setPendingSizes] = useState<PendingSize[]>([]);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [newSize, setNewSize] = useState<PendingSize>({ label: "", altLabel: "", stock: "0" });

  const { data: products, isLoading } = useQuery({
    queryKey: ["admin-products", selectedStoreId],
    enabled: !!selectedStoreId,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*, categories(name)").eq("store_id", selectedStoreId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["categories", selectedStoreId],
    enabled: !!selectedStoreId,
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").eq("store_id", selectedStoreId).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedStoreId) throw new Error("Select a store before saving products.");
      if (pendingImages.length > 4) throw new Error("Each product can only have 4 total images.");
      let image_url: string | undefined;

      // For editing: upload a replacement main image if new images were picked
      if (editingId && pendingImages.length > 0) {
        const mainFile = pendingImages[0];
        image_url = await uploadProductImage(selectedStoreId, editingId, mainFile, "cover");
      }

      const payload = {
        store_id: selectedStoreId,
        name: form.name,
        price: parseFloat(form.price),
        stock: parseInt(form.stock),
        category_id: form.category_id || null,
        ...(image_url ? { image_url } : {}),
      };

      if (editingId) {
        const { error } = await supabase.from("products").update(payload).eq("id", editingId);
        if (error) throw error;

        // Upload remaining as extra images
        for (let i = 1; i < pendingImages.length; i++) {
          const file = pendingImages[i];
          const imageUrl = await uploadProductImage(selectedStoreId, editingId, file, `gallery_${i}`);
          const { error: imgErr } = await supabase.from("product_images").insert({
            product_id: editingId,
            image_url: imageUrl,
            sort_order: i - 1,
          });
          if (imgErr) throw imgErr;
        }
      } else {
        // Creation: first image → main image_url
        const { data: newProduct, error } = await supabase.from("products").insert(payload as any).select("id").single();
        if (error) throw error;
        const pid = newProduct.id;

        if (pendingImages.length > 0) {
          const coverUrl = await uploadProductImage(selectedStoreId, pid, pendingImages[0], "cover");
          const { error: coverErr } = await supabase.from("products").update({ image_url: coverUrl }).eq("id", pid);
          if (coverErr) throw coverErr;
        }

        // Bulk insert pending sizes
        if (pendingSizes.length > 0) {
          const sizeRows = pendingSizes.map((s, i) => ({
            product_id: pid,
            label: s.label,
            alt_label: s.altLabel || null,
            stock: parseInt(s.stock),
            sort_order: i,
          }));
          const { error: sizeErr } = await supabase.from("product_sizes").insert(sizeRows);
          if (sizeErr) throw sizeErr;
        }

        // Upload extra images (index 1+)
        for (let i = 1; i < pendingImages.length; i++) {
          const file = pendingImages[i];
          const imageUrl = await uploadProductImage(selectedStoreId, pid, file, `gallery_${i}`);
          const { error: imgErr } = await supabase.from("product_images").insert({
            product_id: pid,
            image_url: imageUrl,
            sort_order: i - 1,
          });
          if (imgErr) throw imgErr;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-products", selectedStoreId] });
      setForm(emptyForm);
      setEditingId(null);
      setPendingSizes([]);
      setPendingImages([]);
      setNewSize({ label: "", altLabel: "", stock: "0" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-products", selectedStoreId] }),
  });

  const startEdit = (p: Tables<"products">) => {
    setEditingId(p.id);
    setForm({ name: p.name, price: String(p.price), stock: String(p.stock), category_id: p.category_id || "" });
    setPendingSizes([]);
    setPendingImages([]);
  };

  if (storesLoading) return <p className="text-xs text-muted-foreground">Loading...</p>;
  if (!selectedStore) return <p className="text-xs text-muted-foreground">Create a store before adding products.</p>;

  return (
    <div className="max-w-2xl">
      <h2 className="text-sm font-bold uppercase tracking-wider mb-4">{editingId ? "Edit Product" : "Add Product"} - {selectedStore.name}</h2>

      <form
        onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
        className="space-y-3 mb-4"
      >
        <Field label="Product Name" helper="Shown on product cards and order messages.">
          <Input placeholder="Air Force 1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
        </Field>
        <div className="grid gap-3 md:grid-cols-[1fr_8rem]">
          <Field label="Price">
            <Input placeholder="45.00" type="number" step="0.01" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} required />
          </Field>
          <Field label="Stock" helper="Used if no sizes are added.">
            <Input placeholder="0" type="number" value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} required />
          </Field>
        </div>
        <Field label="Category" helper="Optional; used for storefront filtering.">
          <Select value={form.category_id} onValueChange={(v) => setForm((f) => ({ ...f, category_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>

        {/* Images — single unified picker */}
        <div className="border border-border p-3 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1">
            <Image className="h-3 w-3" /> Images
            <span className="text-[10px] text-muted-foreground font-normal">(first is the cover)</span>
          </h3>
          {pendingImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingImages.map((file, i) => (
                <div key={i} className="relative group h-16 w-16 bg-secondary overflow-hidden">
                  <img src={URL.createObjectURL(file)} alt="" className="h-full w-full object-cover" />
                  {i === 0 && (
                    <span className="absolute top-0 left-0 bg-foreground text-background text-[8px] px-1">MAIN</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setPendingImages((p) => p.filter((_, j) => j !== i))}
                    className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Field label="Product Images" helper="Choose up to 4 images. The first image becomes the cover.">
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                const files = e.target.files;
                if (files) setPendingImages((p) => [...p, ...Array.from(files)].slice(0, 4));
                e.target.value = "";
              }}
              className="text-xs"
            />
          </Field>
        </div>

        {/* Inline sizes (creation mode only) */}
        {!editingId && (
          <div className="border border-border p-3 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider">Sizes</h3>
            {pendingSizes.length > 0 && (
              <div className="space-y-1">
                {pendingSizes.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs font-medium w-12">{s.label}</span>
                    {s.altLabel && <span className="text-[10px] text-muted-foreground w-12">({s.altLabel})</span>}
                    <span className="text-xs text-muted-foreground">×{s.stock}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setPendingSizes((p) => p.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Field label="Size" className="w-20">
                <Input placeholder="7" value={newSize.label} onChange={(e) => setNewSize((s) => ({ ...s, label: e.target.value }))} className="h-7 text-xs" />
              </Field>
              <Field label="Alt" className="w-20">
                <Input placeholder="40" value={newSize.altLabel} onChange={(e) => setNewSize((s) => ({ ...s, altLabel: e.target.value }))} className="h-7 text-xs" />
              </Field>
              <Field label="Stock" className="w-16">
                <Input placeholder="0" type="number" value={newSize.stock} onChange={(e) => setNewSize((s) => ({ ...s, stock: e.target.value }))} className="h-7 text-xs" />
              </Field>
              <Button type="button" size="sm" className="self-end h-7 text-[10px] uppercase" onClick={() => { if (newSize.label.trim()) { setPendingSizes((p) => [...p, newSize]); setNewSize({ label: "", altLabel: "", stock: "0" }); } }}>Add</Button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={saveMutation.isPending} className="text-xs uppercase tracking-widest">
            {saveMutation.isPending ? "Saving…" : editingId ? "Update" : "Add Product"}
          </Button>
          {editingId && (
            <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(emptyForm); }} className="text-xs">
              Cancel
            </Button>
          )}
        </div>
      </form>

      {/* Image & Size managers appear when editing an existing product */}
      {editingId && <ImageManager productId={editingId} storeId={selectedStoreId} />}
      {editingId && <SizeManager productId={editingId} />}

      <h2 className="text-sm font-bold uppercase tracking-wider mb-3 mt-8">All Products</h2>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-2">
          {products?.map((p) => (
            <div key={p.id} className="flex items-center gap-3 border border-border p-2">
              <div className="h-10 w-10 bg-secondary shrink-0 overflow-hidden">
                {p.image_url && <img src={p.image_url} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{p.name}</p>
                <p className="text-[10px] text-muted-foreground">${p.price} · Stock: {p.stock}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(p)}>
                <Plus className="h-3 w-3 rotate-45" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(p.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
