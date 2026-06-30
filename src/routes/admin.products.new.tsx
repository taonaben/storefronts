import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { ProductEditor } from "./admin.products";
import { useAdminStores } from "@/hooks/useAdminStores";

export const Route = createFileRoute("/admin/products/new")({
  component: NewProductPage,
});

function NewProductPage() {
  const navigate = useNavigate();
  const { selectedStore } = useAdminStores();
  const storeSearch = selectedStore ? { store: selectedStore.id } : undefined;

  return (
    <div>
      <Link to="/admin/products" search={storeSearch} className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to products
      </Link>
      <ProductEditor onSaved={() => navigate({ to: "/admin/products", search: storeSearch })} />
    </div>
  );
}
