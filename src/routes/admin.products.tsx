import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image, Plus, RefreshCw, Share2, Trash2, X } from "lucide-react";
import { Field } from "@/components/admin/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminStores } from "@/hooks/useAdminStores";
import { supabase } from "@/integrations/supabase/client";
import {
  PRODUCT_TYPE_PRESETS,
  PRODUCT_TYPES,
  buildVariantCombinations,
  cleanAttributes,
  cleanOptions,
  formatSelectedOptions,
  getPresetAttributes,
  getPresetOptions,
  type OptionDraft,
  type ProductAttribute,
  type ProductType,
} from "@/lib/productTypes";
import { appFeedback } from "@/lib/appFeedback";
import { shareProduct } from "@/lib/productShare";
import { useProductStore } from "@/state/product_store";

export const Route = createFileRoute("/admin/products")({
  component: AdminProducts,
});

interface VariantDraft {
  selected_options: Record<string, string>;
  stock: string;
  price_override: string;
  sku: string;
}

interface ProductForm {
  name: string;
  price: string;
  stock: string;
  category_id: string;
  product_type: ProductType;
  attributes: ProductAttribute[];
  options: OptionDraft[];
  variants: VariantDraft[];
}

const emptyForm: ProductForm = {
  name: "",
  price: "",
  stock: "0",
  category_id: "",
  product_type: "general",
  attributes: getPresetAttributes("general"),
  options: [],
  variants: [],
};

const PRODUCT_IMAGE_UPLOAD_TIMEOUT_MS = 45_000;

function createEmptyForm(): ProductForm {
  return {
    ...emptyForm,
    attributes: getPresetAttributes("general"),
    options: [],
    variants: [],
  };
}

function optionKey(options: Record<string, string>) {
  return JSON.stringify(Object.keys(options).sort().reduce<Record<string, string>>((acc, key) => {
    acc[key] = options[key];
    return acc;
  }, {}));
}

function rebuildVariants(options: OptionDraft[], current: VariantDraft[]) {
  const existing = new Map(current.map((variant) => [optionKey(variant.selected_options), variant]));

  return buildVariantCombinations(options).map((selectedOptions) => {
    const found = existing.get(optionKey(selectedOptions));
    return {
      selected_options: selectedOptions,
      stock: found?.stock ?? "0",
      price_override: found?.price_override ?? "",
      sku: found?.sku ?? "",
    };
  });
}

function normalizeOptionName(name: string) {
  return name.trim().toLowerCase();
}

function validateOptions(options: OptionDraft[], requireValues: boolean) {
  const activeOptions = options
    .slice(0, 2)
    .map((option, index) => ({ ...option, index }))
    .filter((option) => option.name.trim() || option.values.some((value) => value.trim()));
  const names = new Map<string, string>();

  for (const option of activeOptions) {
    const name = option.name.trim();
    const values = option.values.map((value) => value.trim()).filter(Boolean);

    if (!name && values.length > 0) return "Name the option before adding values.";
    if (name && requireValues && values.length === 0) return `Add at least one value for ${name}.`;

    const normalizedName = normalizeOptionName(name);
    if (normalizedName && names.has(normalizedName)) {
      return `Use one ${names.get(normalizedName)} option with multiple values instead of adding ${name} twice.`;
    }
    if (normalizedName) names.set(normalizedName, name);
  }

  return null;
}

function hasOptionValues(options: OptionDraft[]) {
  return cleanOptions(options).length > 0;
}

function variantsMatchOptions(options: OptionDraft[], variants: VariantDraft[]) {
  const combinations = buildVariantCombinations(options);
  if (combinations.length === 0) return variants.length === 0;
  if (combinations.length !== variants.length) return false;

  const variantKeys = new Set(variants.map((variant) => optionKey(variant.selected_options)));
  return combinations.every((combination) => variantKeys.has(optionKey(combination)));
}

function getVariantStockTotal(variants: VariantDraft[]) {
  return variants.reduce((sum, variant) => sum + (parseInt(variant.stock) || 0), 0);
}

function getImageExtension(file: File) {
  const typeExtension = file.type.split("/")[1]?.toLowerCase();
  if (typeExtension === "jpeg") return "jpg";
  if (typeExtension) return typeExtension.replace(/[^a-z0-9]/g, "");

  const lastDot = file.name.lastIndexOf(".");
  const nameExtension = lastDot >= 0 ? file.name.slice(lastDot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return nameExtension || "jpg";
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(`${label} timed out. Check your connection and try again.`)), timeoutMs);

    Promise.resolve(promise)
      .then(resolve, reject)
      .finally(() => window.clearTimeout(timeout));
  });
}

async function uploadProductImage(storeId: string, productId: string, file: File, label: string) {
  const ext = getImageExtension(file);
  const path = `stores/${storeId}/products/${productId}/${Date.now()}_${label}.${ext}`;
  const { error: uploadErr } = await withTimeout(
    supabase.storage.from("product-images").upload(path, file),
    PRODUCT_IMAGE_UPLOAD_TIMEOUT_MS,
    `Uploading ${label} image`,
  );
  if (uploadErr) throw uploadErr;
  const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
  return urlData.publicUrl;
}

async function replaceProductSetup(productId: string, options: OptionDraft[], variants: VariantDraft[]) {
  const validationError = validateOptions(options, false);
  if (validationError) throw new Error(validationError);

  const cleanedOptions = cleanOptions(options);

  const { error: variantDeleteError } = await supabase.from("product_variants").delete().eq("product_id", productId);
  if (variantDeleteError) throw variantDeleteError;

  const { error: optionDeleteError } = await supabase.from("product_options").delete().eq("product_id", productId);
  if (optionDeleteError) throw optionDeleteError;

  for (let optionIndex = 0; optionIndex < cleanedOptions.length; optionIndex++) {
    const option = cleanedOptions[optionIndex];
    const { data: insertedOption, error: optionError } = await supabase
      .from("product_options")
      .insert({ product_id: productId, name: option.name, sort_order: optionIndex })
      .select("id")
      .single();
    if (optionError) throw optionError;

    const valueRows = option.values.map((value, valueIndex) => ({
      option_id: insertedOption.id,
      value,
      sort_order: valueIndex,
    }));
    const { error: valueError } = await supabase.from("product_option_values").insert(valueRows);
    if (valueError) throw valueError;
  }

  if (cleanedOptions.length === 0) return;

  const allowedKeys = new Set(cleanedOptions.map((option) => option.name));
  const variantRows = variants
    .map((variant, index) => {
      const selected_options = Object.entries(variant.selected_options).reduce<Record<string, string>>((acc, [key, value]) => {
        if (allowedKeys.has(key) && value) acc[key] = value;
        return acc;
      }, {});
      return {
        product_id: productId,
        selected_options,
        stock: parseInt(variant.stock) || 0,
        price_override: variant.price_override.trim() ? parseFloat(variant.price_override) : null,
        sku: variant.sku.trim() || null,
        sort_order: index,
        active: true,
      };
    })
    .filter((variant) => Object.keys(variant.selected_options).length === cleanedOptions.length);

  if (variantRows.length > 0) {
    const { error: variantError } = await supabase.from("product_variants").insert(variantRows);
    if (variantError) throw variantError;
  }
}

function ProductDetailsEditor({ attributes, onChange }: { attributes: ProductAttribute[]; onChange: (attributes: ProductAttribute[]) => void }) {
  return (
    <div className="border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider">Product Details</h3>
        <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] uppercase" onClick={() => onChange([...attributes, { name: "", value: "" }])}>
          <Plus className="mr-1 h-3 w-3" /> Field
        </Button>
      </div>
      {attributes.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">Add optional details like material, dimensions, ISBN, or compatibility.</p>
      ) : (
        <div className="space-y-2">
          {attributes.map((attribute, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input
                placeholder="Field"
                value={attribute.name}
                onChange={(e) => onChange(attributes.map((item, i) => (i === index ? { ...item, name: e.target.value } : item)))}
                className="h-8 text-xs"
              />
              <Input
                placeholder="Value"
                value={attribute.value}
                onChange={(e) => onChange(attributes.map((item, i) => (i === index ? { ...item, value: e.target.value } : item)))}
                className="h-8 text-xs"
              />
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive sm:self-start" onClick={() => onChange(attributes.filter((_, i) => i !== index))}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OptionsEditor({
  options,
  variants,
  onOptionsChange,
  onVariantsChange,
}: {
  options: OptionDraft[];
  variants: VariantDraft[];
  onOptionsChange: (options: OptionDraft[]) => void;
  onVariantsChange: (variants: VariantDraft[]) => void;
}) {
  const [valueDrafts, setValueDrafts] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const updateOptions = (nextOptions: OptionDraft[]) => {
    onOptionsChange(nextOptions.slice(0, 2));
  };

  const addValue = (optionIndex: number) => {
    const value = (valueDrafts[optionIndex] || "").trim();
    if (!value) return;

    const option = options[optionIndex];
    const duplicate = option.values.some((current) => current.trim().toLowerCase() === value.toLowerCase());
    if (duplicate) {
      setError(`${value} is already added to ${option.name || `option ${optionIndex + 1}`}.`);
      return;
    }

    setError(null);
    updateOptions(options.map((item, index) => (index === optionIndex ? { ...item, values: [...item.values, value] } : item)));
    setValueDrafts((drafts) => ({ ...drafts, [optionIndex]: "" }));
  };

  const removeValue = (optionIndex: number, value: string) => {
    setError(null);
    updateOptions(options.map((item, index) => (index === optionIndex ? { ...item, values: item.values.filter((current) => current !== value) } : item)));
  };

  const buildMatrix = () => {
    const validationError = validateOptions(options, true);
    if (validationError) {
      setError(validationError);
      onVariantsChange([]);
      return;
    }

    setError(null);
    onVariantsChange(rebuildVariants(options, variants));
  };

  return (
    <div className="border border-border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider">Purchase Options</h3>
          <p className="text-[10px] text-muted-foreground">Use these when customer choices affect stock or price.</p>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] uppercase" disabled={options.length >= 2} onClick={() => updateOptions([...options, { name: "", values: [] }])}>
          <Plus className="mr-1 h-3 w-3" /> Option
        </Button>
      </div>

      {options.length > 0 && (
        <div className="space-y-2">
          {options.map((option, index) => (
            <div key={index} className="grid gap-2 md:grid-cols-[10rem_1fr_auto]">
              <Field label={`Option ${index + 1}`}>
                <Input
                  placeholder="Size"
                  value={option.name}
                  onChange={(e) => {
                    setError(null);
                    updateOptions(options.map((item, i) => (i === index ? { ...item, name: e.target.value } : item)));
                  }}
                  className="h-8 text-xs"
                />
              </Field>
              <Field label="Values" helper="Type a value, then press Enter or click Add.">
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Input
                      placeholder="small"
                      value={valueDrafts[index] || ""}
                      onChange={(e) => {
                        setError(null);
                        setValueDrafts((drafts) => ({ ...drafts, [index]: e.target.value }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
                          e.preventDefault();
                          addValue(index);
                        }
                      }}
                      className="h-8 text-xs"
                    />
                    <Button type="button" variant="outline" size="sm" className="h-8 text-[10px] uppercase" onClick={() => addValue(index)}>
                      Add
                    </Button>
                  </div>
                  {option.values.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {option.values.map((value) => (
                        <span key={value} className="inline-flex max-w-full items-center gap-1 border border-border px-2 py-1 text-[10px] font-medium uppercase tracking-wider">
                          <span className="truncate">{value}</span>
                          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => removeValue(index, value)} aria-label={`Remove ${value}`}>
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive md:mt-5" onClick={() => updateOptions(options.filter((_, i) => i !== index))}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" className="h-8 text-[10px] uppercase" onClick={buildMatrix}>
        <RefreshCw className="mr-1 h-3 w-3" /> Build Stock Matrix
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {variants.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Variants</h4>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total stock: {getVariantStockTotal(variants)}</span>
          </div>
          {variants.map((variant, index) => (
            <div key={optionKey(variant.selected_options)} className="grid gap-2 border border-border p-2 md:grid-cols-[1fr_5rem_6rem_7rem]">
              <div className="text-xs font-medium">{formatSelectedOptions(variant.selected_options)}</div>
              <Field label="Stock">
                <Input type="number" value={variant.stock} onChange={(e) => onVariantsChange(variants.map((item, i) => (i === index ? { ...item, stock: e.target.value } : item)))} className="h-8 text-xs" />
              </Field>
              <Field label="Price">
                <Input type="number" step="0.01" placeholder="Base" value={variant.price_override} onChange={(e) => onVariantsChange(variants.map((item, i) => (i === index ? { ...item, price_override: e.target.value } : item)))} className="h-8 text-xs" />
              </Field>
              <Field label="SKU">
                <Input value={variant.sku} onChange={(e) => onVariantsChange(variants.map((item, i) => (i === index ? { ...item, sku: e.target.value } : item)))} className="h-8 text-xs" />
              </Field>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductEditor({ onSaved }: { onSaved?: () => void }) {
  const qc = useQueryClient();
  const clearStoreProducts = useProductStore((state) => state.clearStoreProducts);
  const { selectedStore, selectedStoreId, isLoading: storesLoading } = useAdminStores();
  const storeSearch = selectedStoreId ? { store: selectedStoreId } : undefined;
  const [form, setForm] = useState<ProductForm>(() => createEmptyForm());
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const pendingImagePreviews = useMemo(
    () => pendingImages.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [pendingImages],
  );
  const hasVariants = form.variants.length > 0;
  const stockTotal = hasVariants ? getVariantStockTotal(form.variants) : parseInt(form.stock) || 0;

  useEffect(() => {
    return () => {
      pendingImagePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [pendingImagePreviews]);

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
      const validationError = validateOptions(form.options, false);
      if (validationError) throw new Error(validationError);
      if (hasOptionValues(form.options) && !variantsMatchOptions(form.options, form.variants)) {
        throw new Error("Build the stock matrix after adding option chips, then save the product.");
      }
      const stock = form.variants.length > 0 ? getVariantStockTotal(form.variants) : parseInt(form.stock) || 0;

      const payload = {
        store_id: selectedStoreId,
        name: form.name.trim(),
        price: parseFloat(form.price),
        stock,
        category_id: form.category_id || null,
        product_type: form.product_type,
        attributes: cleanAttributes(form.attributes),
      };

      const { data: newProduct, error } = await supabase.from("products").insert(payload).select("id").single();
      if (error) throw error;
      const productId = newProduct.id;

      if (pendingImages.length > 0) {
        const coverUrl = await uploadProductImage(selectedStoreId, productId, pendingImages[0], "cover");
        const { error: coverErr } = await supabase.from("products").update({ image_url: coverUrl }).eq("id", productId);
        if (coverErr) throw coverErr;
      }

      await replaceProductSetup(productId, form.options, form.variants);

      for (let i = 1; i < pendingImages.length; i++) {
        const imageUrl = await uploadProductImage(selectedStoreId, productId, pendingImages[i], `gallery_${i}`);
        const { error: imgErr } = await supabase.from("product_images").insert({
          product_id: productId,
          image_url: imageUrl,
          sort_order: i - 1,
        });
        if (imgErr) throw imgErr;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-products", selectedStoreId] });
      if (selectedStoreId) clearStoreProducts(selectedStoreId);
      setForm(createEmptyForm());
      setPendingImages([]);
      appFeedback.success({
        title: "Product saved",
        description: "The product has been added successfully.",
      });
      onSaved?.();
    },
    onError: (error) => {
      appFeedback.errorFromUnknown(error, "Product was not saved");
    },
  });

  const changeProductType = (productType: ProductType) => {
    setForm((current) => ({
      ...current,
      product_type: productType,
      attributes: getPresetAttributes(productType),
      options: getPresetOptions(productType),
      variants: [],
    }));
  };

  if (storesLoading) return <p className="text-xs text-muted-foreground">Loading...</p>;
  if (!selectedStore) return <p className="text-xs text-muted-foreground">Create a store before adding products.</p>;

  return (
    <div className="max-w-3xl">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wider">Add Product - {selectedStore.name}</h2>
      <form onSubmit={(e) => { e.preventDefault(); if (!saveMutation.isPending) saveMutation.mutate(); }} className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_13rem]">
          <Field label="Product Name" helper="Shown on product cards and order messages.">
            <Input placeholder="Classic Hoodie" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </Field>
          <Field label="Product Type">
            <Select value={form.product_type} onValueChange={(value) => changeProductType(value as ProductType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRODUCT_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_8rem]">
          <Field label="Price">
            <Input placeholder="45.00" type="number" step="0.01" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} required />
          </Field>
          <Field label="Stock" helper={hasVariants ? "Auto-calculated from variant stock." : "Used if no variants are added."}>
            <Input
              placeholder="0"
              type="number"
              value={hasVariants ? String(stockTotal) : form.stock}
              onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
              readOnly={hasVariants}
              required
              className={hasVariants ? "bg-muted text-muted-foreground" : undefined}
            />
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

        <ProductDetailsEditor attributes={form.attributes} onChange={(attributes) => setForm((f) => ({ ...f, attributes }))} />
        <OptionsEditor options={form.options} variants={form.variants} onOptionsChange={(options) => setForm((f) => ({ ...f, options }))} onVariantsChange={(variants) => setForm((f) => ({ ...f, variants }))} />

        <div className="border border-border p-3 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1">
            <Image className="h-3 w-3" /> Images
            <span className="text-[10px] text-muted-foreground font-normal">(first is the cover)</span>
          </h3>
          {pendingImagePreviews.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingImagePreviews.map(({ file, url }, i) => (
                <div key={`${file.name}-${i}`} className="relative group h-16 w-16 bg-secondary overflow-hidden">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  {i === 0 && <span className="absolute top-0 left-0 bg-foreground text-background text-[8px] px-1">MAIN</span>}
                  <button type="button" onClick={() => setPendingImages((p) => p.filter((_, j) => j !== i))} className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
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

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" disabled={saveMutation.isPending} className="text-xs uppercase tracking-widest">
            {saveMutation.isPending ? "Saving..." : "Add Product"}
          </Button>
          <Button asChild type="button" variant="outline" className="text-xs">
            <Link to="/admin/products" search={storeSearch}>Cancel</Link>
          </Button>
        </div>
        {saveMutation.error && <p className="text-xs text-destructive">{saveMutation.error.message}</p>}
      </form>
    </div>
  );
}

function AdminProducts() {
  const qc = useQueryClient();
  const location = useLocation();
  const clearStoreProducts = useProductStore((state) => state.clearStoreProducts);
  const { selectedStore, selectedStoreId, isLoading: storesLoading } = useAdminStores();
  const storeSearch = selectedStoreId ? { store: selectedStoreId } : undefined;

  const { data: products, isLoading } = useQuery({
    queryKey: ["admin-products", selectedStoreId],
    enabled: !!selectedStoreId,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*, categories(name)").eq("store_id", selectedStoreId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-products", selectedStoreId] });
      if (selectedStoreId) clearStoreProducts(selectedStoreId);
    },
  });

  const shareAdminProduct = async (product: NonNullable<typeof products>[number]) => {
    if (!selectedStore) return;

    const url = new URL(`/s/${selectedStore.slug}/product/${product.id}`, window.location.origin).toString();

    try {
      await shareProduct({
        name: product.name,
        price: product.price,
        storeName: selectedStore.name,
        imageUrl: product.image_url,
        url,
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
    }
  };

  if (storesLoading) return <p className="text-xs text-muted-foreground">Loading...</p>;
  if (!selectedStore) return <p className="text-xs text-muted-foreground">Create a store before adding products.</p>;
  if (location.pathname !== "/admin/products") return <Outlet />;

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider">Products - {selectedStore.name}</h2>
        <Button asChild size="sm" className="h-8 text-[10px] uppercase tracking-wider">
          <Link to="/admin/products/new" search={storeSearch}>
            <Plus className="mr-1 h-3 w-3" /> Add Product
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : products?.length === 0 ? (
        <div className="border border-border p-6 text-center">
          <p className="text-xs text-muted-foreground">No products yet.</p>
          <Button asChild size="sm" className="mt-3 h-8 text-[10px] uppercase tracking-wider">
            <Link to="/admin/products/new" search={storeSearch}>Add Product</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {products?.map((p) => (
            <div key={p.id} className="flex items-center gap-3 border border-border p-2">
              <div className="h-10 w-10 bg-secondary shrink-0 overflow-hidden">
                {p.image_url && <img src={p.image_url} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{p.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  ${p.price} · {PRODUCT_TYPE_PRESETS[(p.product_type as ProductType) || "general"]?.label ?? "General"} · Stock: {p.stock}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shareAdminProduct(p)} aria-label={`Share ${p.name}`}>
                  <Share2 className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(p.id)} aria-label={`Delete ${p.name}`}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
