"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import ThemeToggle from "./ThemeToggle";

export default function NavBar({ role }) {
  return (
    <nav className="border-b border-emerald-950/10 bg-white">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-10">
        <Link href="/dashboard" className="font-semibold tracking-tight text-emerald-950">ColDash <span className="font-normal text-slate-400">v0.5</span></Link>
        <div className="flex flex-wrap items-center justify-end gap-3 text-sm sm:gap-5">
          <Link href="/dashboard" className="text-slate-600 hover:text-emerald-800">Dashboard</Link>
          {role === "admin" && <Link href="/upload" className="text-slate-600 hover:text-emerald-800">Upload</Link>}
          <ThemeToggle />
          <button onClick={() => signOut(auth)} className="rounded-md bg-emerald-900 px-3 py-2 text-white hover:bg-emerald-800">Log out</button>
        </div>
      </div>
    </nav>
  );
}