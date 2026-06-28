import { createFileRoute, Outlet, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminStores } from "@/hooks/useAdminStores";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin - SneakersPlug" }],
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
      <header className="border-b border-border px-4 py-3 md:px-8 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/admin" className="text-sm font-bold uppercase tracking-wider">Admin</Link>
          <nav className="flex items-center gap-4">
            {navItems.map((item) => (
              <Link key={item.to} to={item.to} className={navClass(item.to)}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {stores.length > 0 && (
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="ghost" size="sm" className="text-xs" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>
            Sign Out
          </Button>
        </div>
      </header>
      <div className="p-4 md:p-8">
        <Outlet />
      </div>
    </div>
  );
}
