import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { saveSelectedStoreId } from "@/lib/adminStoreSelection";

export const Route = createFileRoute("/s/$slug/manage")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} - Manage Store` },
      { name: "description", content: "Manage this store." },
    ],
  }),
  component: ManageStoreRoute,
});

function ManageStoreRoute() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();

  const { data: store, isLoading: storeLoading } = useQuery({
    queryKey: ["manage-store", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, owner_id, slug")
        .eq("slug", slug)
        .eq("active", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["manage-store-user"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
  });

  useEffect(() => {
    if (storeLoading || userLoading) return;

    if (!store || !user || store.owner_id !== user.id) {
      navigate({ to: "/login", search: { redirect: `/s/${slug}/manage` } });
      return;
    }

    saveSelectedStoreId(store.id);
    navigate({ to: "/admin" });
  }, [navigate, slug, store, storeLoading, user, userLoading]);

  return <div className="px-4 py-20 text-center text-sm text-muted-foreground">Opening store admin...</div>;
}

