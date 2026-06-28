import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { APP_NAME } from "@/lib/storefront";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: `Owner Login - ${APP_NAME}` }],
  }),
  component: LoginPage,
});

type AuthMode = "signin" | "register";

async function hasStore(userId: string) {
  const { data, error } = await supabase.from("stores").select("id").eq("owner_id", userId).limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);

  const resetMessages = () => {
    setError("");
    setNotice("");
  };

  const routeAfterAuth = async (userId: string) => {
    navigate({ to: await hasStore(userId) ? "/admin" : "/onboarding" });
  };

  const handleSignIn = async () => {
    const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) throw err;
    if (data.user) await routeAfterAuth(data.user.id);
  };

  const handleRegister = async () => {
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (signUpError) throw signUpError;

    if (!data.session || !data.user) {
      setVerificationPending(true);
      setNotice("Check your email to confirm your account. This page will continue when your account is ready.");
      return;
    }

    navigate({ to: "/onboarding" });
  };

  const pollForVerification = async () => {
    const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

    if (err) {
      if (err.message.toLowerCase().includes("email not confirmed")) return;
      if (err.message.toLowerCase().includes("invalid login credentials")) return;
      setError(err.message);
      return;
    }

    if (data.user) navigate({ to: "/onboarding" });
  };

  useEffect(() => {
    if (!verificationPending) return;

    const interval = window.setInterval(() => {
      pollForVerification();
    }, 4000);

    return () => window.clearInterval(interval);
  }, [verificationPending, email, password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);

    try {
      if (mode === "signin") await handleSignIn();
      else await handleRegister();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-xs">
        <h1 className="text-sm font-bold uppercase tracking-wider text-center mb-6">
          {mode === "signin" ? "Owner Login" : "Create Owner Account"}
        </h1>

        <div className="mb-6 grid grid-cols-2 border border-border">
          <button
            type="button"
            onClick={() => { setMode("signin"); setVerificationPending(false); resetMessages(); }}
            className={`h-10 text-xs uppercase tracking-wider ${mode === "signin" ? "bg-foreground text-background" : "text-muted-foreground"}`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode("register"); setVerificationPending(false); resetMessages(); }}
            className={`h-10 text-xs uppercase tracking-wider ${mode === "register" ? "bg-foreground text-background" : "text-muted-foreground"}`}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />

          {error && <p className="text-xs text-destructive">{error}</p>}
          {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
          {verificationPending && (
            <div className="flex flex-col items-center gap-3 border border-border p-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <p className="text-center text-[10px] uppercase tracking-wider text-muted-foreground">
                Confirming Account
              </p>
            </div>
          )}

          <Button type="submit" disabled={loading || verificationPending} className="w-full uppercase tracking-widest text-xs h-10">
            {loading ? "Working..." : mode === "signin" ? "Sign In" : "Create Account"}
          </Button>
        </form>
      </div>
    </div>
  );
}
