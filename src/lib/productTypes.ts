import type { Json } from "@/integrations/supabase/types";

export type ProductType =
  | "general"
  | "clothes"
  | "shoes"
  | "bedding"
  | "house_decor"
  | "books"
  | "cutlery"
  | "beauty"
  | "jewelry"
  | "bags"
  | "car_accessories"
  | "gadgets";

export interface ProductAttribute {
  name: string;
  value: string;
}

export interface OptionDraft {
  name: string;
  values: string[];
}

interface ProductTypePreset {
  label: string;
  attributes: string[];
  options: string[];
}

export const PRODUCT_TYPE_PRESETS: Record<ProductType, ProductTypePreset> = {
  general: {
    label: "General",
    attributes: ["Brand", "Material", "Dimensions"],
    options: [],
  },
  clothes: {
    label: "Clothes",
    attributes: ["Material", "Fit", "Care Instructions"],
    options: ["Size", "Color"],
  },
  shoes: {
    label: "Shoes",
    attributes: ["Brand", "Gender/Age", "Material"],
    options: ["Size", "Color"],
  },
  bedding: {
    label: "Bedding",
    attributes: ["Material", "Thread Count", "Care Instructions"],
    options: ["Bed Size", "Color"],
  },
  house_decor: {
    label: "House Decor",
    attributes: ["Material", "Dimensions", "Room/Use"],
    options: ["Color", "Size"],
  },
  books: {
    label: "Books",
    attributes: ["Author", "Format", "Language", "ISBN"],
    options: ["Format"],
  },
  cutlery: {
    label: "Cutlery",
    attributes: ["Material", "Pieces Included", "Care Instructions"],
    options: ["Set Size", "Color/Finish"],
  },
  beauty: {
    label: "Beauty / Perfumes",
    attributes: ["Scent Notes", "Concentration", "Gender/Audience"],
    options: ["Volume", "Scent"],
  },
  jewelry: {
    label: "Jewelry",
    attributes: ["Material", "Plating", "Stone Type"],
    options: ["Color/Finish", "Size"],
  },
  bags: {
    label: "Bags",
    attributes: ["Material", "Dimensions", "Compartments"],
    options: ["Color", "Size"],
  },
  car_accessories: {
    label: "Car Accessories",
    attributes: ["Compatibility", "Part Number", "Material"],
    options: ["Vehicle Model", "Color/Side"],
  },
  gadgets: {
    label: "Gadgets",
    attributes: ["Brand", "Warranty", "Compatibility"],
    options: ["Color", "Storage/Capacity"],
  },
};

export const PRODUCT_TYPES = Object.entries(PRODUCT_TYPE_PRESETS).map(([value, preset]) => ({
  value: value as ProductType,
  label: preset.label,
}));

export function getPresetAttributes(type: ProductType): ProductAttribute[] {
  return PRODUCT_TYPE_PRESETS[type].attributes.map((name) => ({ name, value: "" }));
}

export function getPresetOptions(type: ProductType): OptionDraft[] {
  return PRODUCT_TYPE_PRESETS[type].options.slice(0, 2).map((name) => ({ name, values: [] }));
}

export function parseAttributes(value: Json | null | undefined): ProductAttribute[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim() : "";
      const fieldValue = typeof record.value === "string" ? record.value.trim() : "";
      return name ? { name, value: fieldValue } : null;
    })
    .filter((item): item is ProductAttribute => Boolean(item));
}

export function cleanAttributes(attributes: ProductAttribute[]): ProductAttribute[] {
  return attributes
    .map((attribute) => ({
      name: attribute.name.trim(),
      value: attribute.value.trim(),
    }))
    .filter((attribute) => attribute.name || attribute.value);
}

export function cleanOptions(options: OptionDraft[]): OptionDraft[] {
  return options
    .slice(0, 2)
    .map((option) => {
      const seenValues = new Set<string>();
      const values = option.values
        .map((value) => value.trim())
        .filter(Boolean)
        .filter((value) => {
          const key = value.toLowerCase();
          if (seenValues.has(key)) return false;
          seenValues.add(key);
          return true;
        });

      return {
        name: option.name.trim(),
        values,
      };
    })
    .filter((option) => option.name && option.values.length > 0);
}

export function buildVariantCombinations(options: OptionDraft[]) {
  const cleaned = cleanOptions(options);
  if (cleaned.length === 0) return [];

  if (cleaned.length === 1) {
    return cleaned[0].values.map((value) => ({ [cleaned[0].name]: value }));
  }

  const [first, second] = cleaned;
  return first.values.flatMap((firstValue) =>
    second.values.map((secondValue) => ({
      [first.name]: firstValue,
      [second.name]: secondValue,
    })),
  );
}

export function formatSelectedOptions(options?: Record<string, string> | null) {
  if (!options) return "";
  return Object.entries(options)
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}: ${value}`)
    .join(" · ");
}

export function selectedOptionsFromJson(value: Json | null | undefined): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value as Record<string, Json>).reduce<Record<string, string>>((acc, [key, optionValue]) => {
    if (typeof optionValue === "string") acc[key] = optionValue;
    return acc;
  }, {});
}
