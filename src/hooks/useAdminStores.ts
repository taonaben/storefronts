import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedStoreId, saveSelectedStoreId } from "@/lib/adminStoreSelection";

export function slugify(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export function useAdminStores() {
  const location = useLocation();
  const navigate = useNavigate();
  const searchStoreId = typeof (location.search as Record<string, unknown>).store === "string"
    ? ((location.search as Record<string, unknown>).store as string)
    : "";
  const [selectedStoreId, setSelectedStoreIdState] = useState<string>(() => {
    return getSelectedStoreId();
  });

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
  });

  const storesQuery = useQuery({
    queryKey: ["owned-stores", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const stores = storesQuery.data ?? [];
  const selectedStore = useMemo(
    () => stores.find((store) => store.id === selectedStoreId) ?? stores[0] ?? null,
    [selectedStoreId, stores],
  );

  useEffect(() => {
    if (searchStoreId && searchStoreId !== selectedStoreId) {
      setSelectedStoreIdState(searchStoreId);
      saveSelectedStoreId(searchStoreId);
    }
  }, [searchStoreId, selectedStoreId]);

  useEffect(() => {
    if (!stores.length) return;
    if (!selectedStoreId || !stores.some((store) => store.id === selectedStoreId)) {
      setSelectedStoreId(stores[0].id);
    }
  }, [selectedStoreId, stores]);

  const setSelectedStoreId = (storeId: string) => {
    setSelectedStoreIdState(storeId);
    saveSelectedStoreId(storeId);
    navigate({
      replace: true,
      search: (current) => ({
        ...current,
        store: storeId,
      }),
    } as never);
  };

  return {
    user,
    stores,
    selectedStore,
    selectedStoreId: selectedStore?.id ?? "",
    setSelectedStoreId,
    isLoading: userLoading || storesQuery.isLoading,
    refetchStores: storesQuery.refetch,
  };
}
