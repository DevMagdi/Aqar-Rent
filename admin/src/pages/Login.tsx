// Login: email + password + TOTP 2FA.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, saveSession } from "@/lib/api";

export function Login() {
  const [email, setEmail] = useState("admin@aqar-rent.dev");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await api<{ access_token: string; role: string }>("/admin/auth/login", {
        method: "POST",
        body: { email, password, totp_code: code },
      });
      saveSession(res.access_token, res.role);
      nav("/");
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-stone-900 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl" data-testid="login-form">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-white">A</span>
          <div>
            <h1 className="text-lg font-extrabold text-stone-900">Aqar Rent Admin</h1>
            <p className="text-xs text-stone-500">Email + password + authenticator code</p>
          </div>
        </div>

        <label className="block text-sm font-semibold text-stone-700" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          data-testid="input-email"
          type="email"
          dir="ltr"
          autoComplete="username"
          className="mt-1 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label className="mt-4 block text-sm font-semibold text-stone-700" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          data-testid="input-password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          className="mt-1 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />

        <label className="mt-4 block text-sm font-semibold text-stone-700" htmlFor="totp">
          2FA code
        </label>
        <input
          id="totp"
          data-testid="input-totp"
          dir="ltr"
          inputMode="numeric"
          maxLength={6}
          placeholder="123456"
          className="mt-1 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-center text-lg tracking-[0.4em] outline-none focus:border-brand-600"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          required
          pattern="\d{6}"
        />

        {err && (
          <p role="alert" className="mt-3 text-sm font-semibold text-red-600" data-testid="login-error">
            {err}
          </p>
        )}

        <button
          type="submit"
          data-testid="btn-login"
          disabled={busy}
          className="mt-6 w-full rounded-xl bg-brand-600 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
