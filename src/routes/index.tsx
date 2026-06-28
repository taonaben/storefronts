import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { APP_NAME } from "@/lib/storefront";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${APP_NAME} - Find a store` },
      { name: "description", content: "Search for active stores and browse their products." },
      { property: "og:title", content: `${APP_NAME} - Find a store` },
      { property: "og:description", content: "Search for active stores and browse their products." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const [search, setSearch] = useState("");
  const term = search.trim();

  const { data: stores, isLoading } = useQuery({
    queryKey: ["public-stores", term],
    queryFn: async () => {
      let query = supabase
        .from("stores")
        .select("id, name, slug, description, logo_url")
        .eq("active", true)
        .order("name")
        .limit(12);

      if (term) {
        const safeTerm = term.replace(/[%,]/g, "");
        query = query.or(`name.ilike.%${safeTerm}%,slug.ilike.%${safeTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="px-4 py-10 md:px-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-lg font-bold uppercase tracking-wider">Find a Store</h1>
        <p className="mt-2 text-sm text-muted-foreground">Search stores by name or link.</p>

        <div className="relative mt-6">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stores"
            className="pl-9"
          />
        </div>

        <div className="mt-6 space-y-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse bg-secondary" />)
          ) : stores?.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No stores found.</p>
          ) : (
            stores?.map((store) => (
              <Link
                key={store.id}
                to="/s/$slug"
                params={{ slug: store.slug }}
                className="flex items-center gap-3 border border-border p-3 transition-colors hover:bg-secondary"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden bg-secondary text-xs font-bold uppercase">
                  {store.logo_url ? <img src={store.logo_url} alt={store.name} className="h-full w-full object-cover" /> : store.name.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold uppercase tracking-wider">{store.name}</p>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">/s/{store.slug}</p>
                  {store.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{store.description}</p>}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
