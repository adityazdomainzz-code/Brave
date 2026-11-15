import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { toast, Toaster } from "sonner";
import { authClient, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { BootScreen } from "@/components/brevilo/boot";
import { Logo, Wordmark } from "@/components/brevilo/logo";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || isPending) return <BootScreen label="Checking your session" />;
  if (user) return <Navigate to="/" />;

  async function onEmail(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result =
        mode === "up"
          ? await authClient.signUp.email({ email, password, name: name || email.split("@")[0] || "Member" })
          : await authClient.signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message || "Sign-in failed.");
      window.location.href = "/";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh md:grid-cols-2">
      <Toaster theme="dark" position="top-center" />
      <section className="hidden flex-col justify-between p-10 md:flex">
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <Wordmark />
        </div>
        <div className="max-w-md">
          <h1 className="display text-4xl font-bold leading-tight">A quieter place to think, code, and read.</h1>
          <p className="mt-4 text-muted">BREVILO keeps your chats, files, and preferences with your account. Replies are generated on the server.</p>
        </div>
        <p className="text-sm text-subtle">Assistant · Code · Files</p>
      </section>
      <section className="grid place-items-center px-5 py-10">
        <div className="glass w-full max-w-md rounded-xl p-6">
          <div className="mb-5 flex items-center gap-3 md:hidden">
            <Logo />
            <Wordmark />
          </div>
          <h2 className="display text-2xl font-bold">{mode === "up" ? "Create your studio" : "Sign in"}</h2>
          <p className="mt-1 text-sm text-muted">Use Google, X, or email.</p>
          <div className="mt-5 grid gap-2">
            {GROK_PROVIDERS.map((provider) => (
              <button
                key={provider.providerId}
                type="button"
                className="btn btn-ghost press"
                onClick={() => {
                  void signIn(provider.providerId, { callbackURL: "/" }).catch((err) =>
                    toast.error(err instanceof Error ? err.message : "Sign-in failed."),
                  );
                }}
              >
                Continue with {provider.label}
              </button>
            ))}
          </div>
          <form className="mt-5 grid gap-3" onSubmit={onEmail}>
            {mode === "up" ? (
              <label className="grid gap-1 text-sm text-muted">
                Name
                <input className="field" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
              </label>
            ) : null}
            <label className="grid gap-1 text-sm text-muted">
              Email
              <input className="field" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
            </label>
            <label className="grid gap-1 text-sm text-muted">
              Password
              <input
                className="field"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "up" ? "new-password" : "current-password"}
              />
            </label>
            <button type="submit" className="btn btn-primary press" disabled={busy}>
              {busy ? "Please wait" : mode === "up" ? "Create account" : "Sign in with email"}
            </button>
          </form>
          <button type="button" className="mt-4 text-sm text-muted underline-offset-4 hover:underline" onClick={() => setMode(mode === "up" ? "in" : "up")}>
            {mode === "up" ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
        </div>
      </section>
    </main>
  );
}
