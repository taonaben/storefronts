const SELECTED_STORE_KEY = "sneakersplug_selected_store_id";

export function getSelectedStoreId() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(SELECTED_STORE_KEY) || "";
}

export function saveSelectedStoreId(storeId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SELECTED_STORE_KEY, storeId);
}
