import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSelectedStoreId } from "@/lib/adminStoreSelection";
import { slugify } from "@/hooks/useAdminStores";
import { APP_NAME } from "@/lib/storefront";
import { cn } from "@/lib/utils";
import { STORE_DISPLAY_PICTURE_ACCEPT, uploadStoreDisplayPicture } from "@/lib/storeDisplayPicture";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [{ title: `Owner Onboarding - ${APP_NAME}` }],
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

async function getCurrentAuthUser() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user) return sessionData.session.user;

  const { data: userData } = await supabase.auth.getUser();
  return userData.user;
}

function getAuthCallbackParams() {
  if (typeof window === "undefined") return { code: null, error: null, isCallback: false };

  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const code = url.searchParams.get("code");
  const error =
    url.searchParams.get("error_description") ??
    url.searchParams.get("error") ??
    hashParams.get("error_description") ??
    hashParams.get("error");

  return { code, error, isCallback: Boolean(code || error || hashParams.get("access_token")) };
}

function clearAuthCallbackParams() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  ["code", "error", "error_code", "error_description"].forEach((param) => url.searchParams.delete(param));
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}

async function getUserAfterAuthRedirect() {
  const { code, error: callbackError, isCallback } = getAuthCallbackParams();
  if (callbackError) throw new Error(callbackError);

  let exchangeError = "";
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) exchangeError = error.message;
    else clearAuthCallbackParams();
  }

  const currentUser = await getCurrentAuthUser();
  if (currentUser) return currentUser;

  const user = await new Promise<Awaited<ReturnType<typeof getCurrentAuthUser>>>((resolve) => {
    let settled = false;
    let unsubscribe = () => {};

    const finish = (user: Awaited<ReturnType<typeof getCurrentAuthUser>>) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      unsubscribe();
      resolve(user);
    };

    const timeout = window.setTimeout(() => finish(null), isCallback ? 8000 : 2500);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) finish(session.user);
    });
    unsubscribe = () => subscription.unsubscribe();
    if (settled) unsubscribe();
  });

  if (user) return user;
  if (exchangeError) throw new Error(exchangeError);

  return null;
}

function OnboardingPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [debouncedStoreSlug, setDebouncedStoreSlug] = useState("");
  const [storeSlugTaken, setStoreSlugTaken] = useState(false);
  const [orderPhone, setOrderPhone] = useState("");
  const [displayPicture, setDisplayPicture] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const user = await getUserAfterAuthRedirect();
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not confirm your session. Please sign in.");
        setLoading(false);
      }
    };

    load();
  }, [navigate]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedStoreSlug(storeSlug.trim()), 350);
    return () => window.clearTimeout(timeout);
  }, [storeSlug]);

  useEffect(() => {
    let active = true;

    const checkSlug = async () => {
      if (!debouncedStoreSlug) {
        setStoreSlugTaken(false);
        return;
      }

      const { data, error } = await supabase.from("stores").select("id").eq("slug", debouncedStoreSlug).maybeSingle();
      if (!active) return;
      setStoreSlugTaken(Boolean(!error && data));
    };

    checkSlug();
    return () => {
      active = false;
    };
  }, [debouncedStoreSlug]);

  const validate = () => {
    if (!displayName.trim()) return "Enter your name.";
    if (!ownerPhone.trim()) return "Enter your phone number.";
    if (!storeName.trim()) return "Enter your store name.";
    if (!storeSlug.trim()) return "Enter your store link.";
    if (storeSlugTaken) return "That store link is already taken. Try another link.";
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

      if (displayPicture) {
        try {
          await uploadStoreDisplayPicture(store.id, displayPicture);
        } catch (imageError) {
          await supabase.from("stores").delete().eq("id", store.id);
          throw imageError;
        }
      }

      saveSelectedStoreId(store.id);
      navigate({ to: "/admin" });
    } catch (err) {
      setError(readableError(err instanceof Error ? err.message : "Something went wrong."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading...</div>;

  if (!userId) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-xs space-y-4 text-center">
          <h1 className="text-sm font-bold uppercase tracking-wider">Confirm Your Account</h1>
          <p className="text-xs text-muted-foreground">
            {error || "We could not finish confirming your account in this tab."}
          </p>
          <Button onClick={() => navigate({ to: "/login" })} className="w-full uppercase tracking-widest text-xs h-10">
            Back to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-sm font-bold uppercase tracking-wider text-center mb-6">Set Up Your Store</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Owner Profile</p>
            <div className="space-y-3">
              <Input placeholder="Your name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
              <Input placeholder="Your phone number" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} required />
            </div>
          </div>

          <div className="pt-2">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">First Store</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium">Display picture <span className="text-muted-foreground">(optional)</span></label>
                <Input
                  type="file"
                  accept={STORE_DISPLAY_PICTURE_ACCEPT}
                  onChange={(event) => setDisplayPicture(event.target.files?.[0] ?? null)}
                />
                {displayPicture && <p className="mt-1 text-xs text-muted-foreground">{displayPicture.name}</p>}
              </div>
              <Input
                placeholder="Store name"
                value={storeName}
                onChange={(e) => {
                  const name = e.target.value;
                  setStoreName(name);
                  if (!slugManuallyEdited) setStoreSlug(slugify(name));
                }}
                required
              />
              <Input
                placeholder="Store link"
                value={storeSlug}
                onChange={(e) => {
                  setSlugManuallyEdited(true);
                  setStoreSlug(slugify(e.target.value));
                }}
                className={cn(storeSlugTaken && "border-destructive focus-visible:ring-destructive")}
                required
              />
              {storeSlugTaken && <p className="-mt-1 text-xs text-destructive">That store link is taken. Try another link.</p>}
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
