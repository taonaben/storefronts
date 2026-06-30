import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Package, ShoppingCart, Store, Tag, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminStores } from "@/hooks/useAdminStores";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

function ProfileValue({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-xs font-medium">{value?.trim() || "Not set"}</p>
    </div>
  );
}

function AdminDashboard() {
  const { user, stores, selectedStore, isLoading: adminLoading } = useAdminStores();
  const storeSearch = selectedStore ? { store: selectedStore.id } : undefined;
  const { data: profile, isLoading: profileLoading, error: profileError } = useQuery({
    queryKey: ["owner-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("owner_profiles")
        .select("display_name, email, phone, updated_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const links = [
    { to: "/admin/stores" as const, label: "Stores", icon: Store, desc: "Manage storefronts" },
    { to: "/admin/products" as const, label: "Products", icon: Package, desc: "Manage inventory" },
    { to: "/admin/orders" as const, label: "Orders", icon: ShoppingCart, desc: "View & update orders" },
    { to: "/admin/categories" as const, label: "Categories", icon: Tag, desc: "Manage categories" },
    { to: "/admin/zones" as const, label: "Delivery Zones", icon: MapPin, desc: "Toggle active zones" },
  ];

  if (adminLoading || profileLoading) return <p className="text-xs text-muted-foreground">Loading...</p>;

  return (
    <div className="max-w-4xl space-y-5">
      <section className="grid gap-3 md:grid-cols-[1fr_1fr]">
        <div className="border border-border p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Owner Profile</p>
              <h1 className="mt-1 text-lg font-bold uppercase tracking-wider">
                {profile?.display_name?.trim() || user?.email || "Admin"}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {stores.length} {stores.length === 1 ? "store" : "stores"} connected
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-foreground text-background">
              <User className="h-5 w-5" />
            </div>
          </div>

          <div className="grid gap-3">
            <ProfileValue label="Email" value={profile?.email || user?.email} />
            <ProfileValue label="Phone" value={profile?.phone} />
          </div>
        </div>

        <div className="border border-border p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Selected Store</p>
              <h2 className="mt-1 text-lg font-bold uppercase tracking-wider">{selectedStore?.name || "No store selected"}</h2>
              <p className="mt-1 truncate text-xs text-muted-foreground">{selectedStore ? `/s/${selectedStore.slug}` : "Choose a store from the dropdown"}</p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-foreground text-background">
              <Store className="h-5 w-5" />
            </div>
          </div>

          <div className="grid gap-3">
            <ProfileValue label="Order Text Number" value={selectedStore?.order_notification_phone} />
            <ProfileValue label="Status" value={selectedStore ? (selectedStore.active ? "Active" : "Inactive") : null} />
          </div>
        </div>

        {profileError && (
          <p className="border border-border p-3 text-xs text-destructive md:col-span-2">
            {profileError instanceof Error ? profileError.message : "Could not load owner profile."}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider">Admin Tools</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5 md:gap-4">
          {links.map((l) => (
            <Link key={l.to} to={l.to} search={storeSearch} className="border border-border p-4 transition-colors hover:bg-secondary">
              <l.icon className="h-5 w-5 mb-2" />
              <p className="text-xs font-bold uppercase tracking-wider">{l.label}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{l.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
