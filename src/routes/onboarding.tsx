import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSelectedStoreId } from "@/lib/adminStoreSelection";
import { slugify } from "@/hooks/useAdminStores";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [{ title: "Owner Onboarding - SneakersPlug" }],
  }),
  component: OnboardingPage,
});

function readableError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("duplicate") || lower.includes("unique") || lower.includes("stores_slug_key")) {
    return "That store link is already taken. Try another slug.";
  }
  if (lower.includes("store limit")) return "You have reached the 3 store limit.";
  return message;
}

function OnboardingPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [orderPhone, setOrderPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate({ to: "/login" });
        return;
      }

      const { data: stores, error: storesError } = await supabase.from("stores").select("id").eq("owner_id", user.id).limit(1);
      if (storesError) {
        setError(storesError.message);
        setLoading(false);
        return;
      }

      if ((stores?.length ?? 0) > 0) {
        navigate({ to: "/admin" });
        return;
      }

      const { data: profile } = await supabase.from("owner_profiles").select("*").eq("user_id", user.id).maybeSingle();
      setUserId(user.id);
      setEmail(user.email ?? "");
      setDisplayName(profile?.display_name ?? "");
      setOwnerPhone(profile?.phone ?? "");
      setLoading(false);
    };

    load();
  }, [navigate]);

  const validate = () => {
    if (!displayName.trim()) return "Enter your display name.";
    if (!ownerPhone.trim()) return "Enter your phone number.";
    if (!storeName.trim()) return "Enter your store name.";
    if (!storeSlug.trim()) return "Enter your store link.";
    if (!orderPhone.trim()) return "Enter the phone number that should receive order texts.";
    return "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      const { error: profileError } = await supabase.from("owner_profiles").upsert({
        user_id: userId,
        display_name: displayName.trim(),
        phone: ownerPhone.trim(),
        email,
      });
      if (profileError) throw profileError;

      const { data: store, error: storeError } = await supabase
        .from("stores")
        .insert({
          owner_id: userId,
          name: storeName.trim(),
          slug: storeSlug.trim(),
          order_notification_phone: orderPhone.trim(),
        })
        .select("id")
        .single();
      if (storeError) throw storeError;

      saveSelectedStoreId(store.id);
      navigate({ to: "/admin" });
    } catch (err) {
      setError(readableError(err instanceof Error ? err.message : "Something went wrong."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-sm font-bold uppercase tracking-wider text-center mb-6">Set Up Your Store</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Owner Profile</p>
            <div className="space-y-3">
              <Input placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
              <Input placeholder="Owner phone number" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} required />
            </div>
          </div>

          <div className="pt-2">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">First Store</p>
            <div className="space-y-3">
              <Input
                placeholder="Store name"
                value={storeName}
                onChange={(e) => {
                  const name = e.target.value;
                  setStoreName(name);
                  setStoreSlug((current) => current || slugify(name));
                }}
                required
              />
              <Input
                placeholder="Store link"
                value={storeSlug}
                onChange={(e) => setStoreSlug(slugify(e.target.value))}
                required
              />
              <Input
                placeholder="Order text phone number"
                value={orderPhone}
                onChange={(e) => setOrderPhone(e.target.value)}
                required
              />
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button type="submit" disabled={saving} className="w-full uppercase tracking-widest text-xs h-10">
            {saving ? "Saving..." : "Finish Setup"}
          </Button>
        </form>
      </div>
    </div>
  );
}
