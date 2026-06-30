import { createFileRoute, Outlet, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminStores } from "@/hooks/useAdminStores";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/storefront";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: `Admin - ${APP_NAME}` }],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const { stores, selectedStoreId, setSelectedStoreId } = useAdminStores();
  const navItems = [
    { to: "/admin/stores" as const, label: "Stores" },
    { to: "/admin/products" as const, label: "Products" },
    { to: "/admin/orders" as const, label: "Orders" },
    { to: "/admin/categories" as const, label: "Categories" },
    { to: "/admin/zones" as const, label: "Zones" },
  ];
  const navClass = (to: string) => cn(
    "border-b border-transparent pb-1 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground",
    location.pathname === to && "border-foreground text-foreground font-medium",
  );

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate({ to: "/login" });
        return;
      }

      setIsAuthed(true);
      setLoading(false);
    };

    check();
  }, [navigate]);

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading...</div>;
  if (!isAuthed) return null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-4 py-3 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 md:flex-nowrap">
          <Link to="/admin" search={selectedStoreId ? { store: selectedStoreId } : undefined} className="shrink-0 text-sm font-bold uppercase tracking-wider">Admin</Link>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 md:order-3 md:flex-none">
            {stores.length > 0 && (
              <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                <SelectTrigger className="h-8 min-w-0 flex-1 text-xs sm:w-44 sm:flex-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>
              Sign Out
            </Button>
          </div>
          <nav className="-mx-4 order-3 flex w-[calc(100%+2rem)] items-center gap-4 overflow-x-auto px-4 pt-2 md:order-2 md:mx-0 md:w-auto md:overflow-visible md:px-0 md:pt-0">
            {navItems.map((item) => (
              <Link key={item.to} to={item.to} search={selectedStoreId ? { store: selectedStoreId } : undefined} className={cn(navClass(item.to), "shrink-0")}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <div className="px-4 py-5 md:p-8">
        <Outlet />
      </div>
    </div>
  );
}
