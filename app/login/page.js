"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "../../lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.push("/dashboard");
    } catch {
      setError("Unable to sign in with those credentials.");
      setLoading(false);
    }
  }
  async function handleGoogleLogin() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      router.push("/dashboard");
    } catch {
      setError("Unable to complete Google sign-in.");
      setLoading(false);
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-lg bg-white p-8 shadow-sm"
      >
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">
            ColDash{" "}
            <span className="font-normal tracking-normal text-slate-400">
              v0.5
            </span>
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-emerald-950">
            Log in
          </h1>
        </div>
        <label className="block text-sm">
          Email
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={loading} className="w-full rounded-md bg-emerald-900 px-4 py-2 text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? "Signing in..." : "Log in"}
        </button>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          or
          <span className="h-px flex-1 bg-slate-200" />
        </div>
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full rounded-md border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue with Google
        </button>
      </form>
    </main>
  );
}
