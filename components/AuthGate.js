"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";
import { getUserRole } from "../lib/getUserRole";
import NavBar from "./NavBar";

export default function AuthGate({ allowedRoles, children }) {
  const router = useRouter();
  const [state, setState] = useState({ loading: true, user: null, role: null, error: "" });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setState({ loading: false, user: null, role: null, error: "" });
        router.push("/login");
        return;
      }
      getUserRole(user)
        .then((role) => setState({ loading: false, user, role, error: "" }))
        .catch(() => setState({ loading: false, user, role: null, error: "Unable to load your access profile." }));
    });
    return unsubscribe;
  }, [router]);

  if (state.loading) return <main className="mx-auto w-full max-w-[1600px] px-4 py-12 text-slate-500 sm:px-6 lg:px-10">Loading...</main>;
  if (state.error) return <main className="mx-auto w-full max-w-[1600px] px-4 py-12 sm:px-6 lg:px-10"><h1 className="text-xl font-semibold text-red-800">Unable to load your access profile</h1><p className="mt-2 text-slate-600">{state.error}</p><p className="mt-4 text-sm text-slate-500">Publish the Firestore rules from <code>firestore.rules</code> in your Firebase project, then refresh this page.</p></main>;
  if (!allowedRoles.includes(state.role)) return <main className="mx-auto w-full max-w-[1600px] px-4 py-12 sm:px-6 lg:px-10"><h1 className="text-xl font-semibold text-red-800">401 Unauthorized</h1><p className="mt-2 text-slate-600">Please ask the Website Administrator to authorize your Gmail account.</p></main>;
  return <><NavBar role={state.role} /><main className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 lg:px-10 xl:py-10">{children}</main></>;
}