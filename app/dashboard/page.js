"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getCountFromServer,
  getDocs,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import AuthGate from "../../components/AuthGate";
import CollectorCharts, { MasterlistShareChart } from "../../components/CollectorCharts";
import { auth, db } from "../../lib/firebase";
import { findCollectibleField } from "../../lib/findCollectibleField";
import { getUserRole } from "../../lib/getUserRole";

function getCollectorField(headers) {
  return headers.find((header) => String(header).trim().toLowerCase() === "collector") || "";
}

function DashboardContent() {
  const [lists, setLists] = useState([]);
  const [error, setError] = useState("");
  const [selectedCollector, setSelectedCollector] = useState("");
  const [collectorsOpen, setCollectorsOpen] = useState(false);
  const [masterlistChartOpen, setMasterlistChartOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingListId, setEditingListId] = useState("");
  const [draftName, setDraftName] = useState("");
  const [savingName, setSavingName] = useState(false);
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setIsAdmin(user ? (await getUserRole(user)) === "admin" : false);
    });
    return unsubscribe;
  }, []);
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "masterlist_registry"),
      async (snapshot) => {
        try {
          const results = await Promise.all(
            snapshot.docs.map(async (item) => {
              const data = item.data();
              const collectionRef = collection(db, data.collectionName);
              const [countSnapshot, recordsSnapshot] = await Promise.all([
                getCountFromServer(collectionRef),
                getDocs(collectionRef),
              ]);
              const records = recordsSnapshot.docs.map((record) => ({
                id: record.id,
                ...record.data(),
              }));
              let collectibleTotal = 0;
              let paidTotal = 0;
              let ptpTotal = 0;
              const collectibleField = findCollectibleField(data);
              const collectorField = getCollectorField(data.fieldNames || []);
              if (collectibleField) {
                collectibleTotal = records.reduce((sum, record) => {
                  const amount = Number(
                    String(record[collectibleField] ?? "").replace(/,/g, ""),
                  );
                  const paid = Number(
                    String(record.amountPaid ?? "").replace(/,/g, ""),
                  ) || 0;
                  return Number.isNaN(amount)
                    ? sum
                    : sum + Math.max(0, amount - paid);
                }, 0);
              }
              paidTotal = records.reduce(
                (sum, record) =>
                  sum +
                  (Number(String(record.amountPaid ?? "").replace(/,/g, "")) ||
                    0),
                0,
              );
              ptpTotal = records.reduce(
                (sum, record) =>
                  sum +
                  (Number(String(record.ptp ?? "").replace(/,/g, "")) || 0),
                0,
              );
              return {
                id: item.id,
                ...data,
                count: countSnapshot.data().count,
                collectibleField,
                collectorField,
                collectibleTotal,
                paidTotal,
                ptpTotal,
                records,
              };
            }),
          );
          setLists(results);
          setError("");
        } catch (loadError) {
          setError(loadError.message);
        }
      },
      (loadError) => {
        setError(loadError.message);
      },
    );

    return () => unsubscribe();
  }, []);
  const total = lists.reduce((sum, item) => sum + item.count, 0);
  const collectibleTotal = lists.reduce(
    (sum, item) => sum + item.collectibleTotal,
    0,
  );
  const paidTotal = lists.reduce((sum, item) => sum + item.paidTotal, 0);
  const ptpTotal = lists.reduce((sum, item) => sum + item.ptpTotal, 0);
  const collectorStats = [...lists.reduce((groups, list) => {
    const collectorField = list.collectorField || "";
    if (!collectorField) return groups;
    list.records.forEach((record) => {
      const name = String(record[collectorField] || "Unassigned").trim() || "Unassigned";
      const key = name.toLowerCase();
      const current = groups.get(key) || {
        name,
        clients: 0,
        amount: 0,
        balance: 0,
        paid: 0,
        ptp: 0,
      };
      const amountValue = Number(String(record[list.collectibleField || ""] ?? "").replace(/,/g, "")) || 0;
      const balance = Math.max(0, amountValue - (Number(String(record.amountPaid ?? "").replace(/,/g, "")) || 0));
      current.clients += 1;
      current.amount += amountValue;
      current.balance += balance;
      current.paid += Number(String(record.amountPaid ?? "").replace(/,/g, "")) || 0;
      current.ptp += Number(String(record.ptp ?? "").replace(/,/g, "")) || 0;
      groups.set(key, current);
    });
    return groups;
  }, new Map()).values()].sort((left, right) => right.ptp - left.ptp);
  const visibleLists = selectedCollector
    ? lists.filter((list) =>
        (list.records || []).some((record) => {
          const collectorField = list.collectorField || "";
          return (
            collectorField &&
            String(record[collectorField] || "Unassigned").trim().toLowerCase() ===
              selectedCollector
          );
        }),
      )
    : lists;
  const money = (value) =>
    value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  function startEditingName(item) {
    setEditingListId(item.id);
    setDraftName(item.masterlistName || "");
    setError("");
  }
  function cancelEditingName() {
    setEditingListId("");
    setDraftName("");
  }
  async function saveName(item) {
    const nextName = draftName.trim();
    if (!nextName || savingName) return;
    setSavingName(true);
    setError("");
    try {
      await updateDoc(doc(db, "masterlist_registry", item.id), {
        masterlistName: nextName,
      });
      cancelEditingName();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingName(false);
    }
  }
  return (
    <>
      <div className="mb-10">
        <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">
          Overview
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-emerald-950">
          Masterlists
        </h1>
        <p className="mt-2 text-slate-500">
          Choose a masterlist to view its records.
        </p>
      </div>
      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <section className="rounded-lg bg-emerald-900 p-6 text-white">
          <p className="text-sm text-emerald-100">Total clients</p>
          <p className="mt-2 text-4xl font-semibold">
            {total.toLocaleString()}
          </p>
        </section>
        <section className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">Total Current Balance</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-950">
            {money(collectibleTotal)}
          </p>
        </section>
        <section className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">Total Paid</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-950">
            {money(paidTotal)}
          </p>
        </section>
        <section className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">Total PTP</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-950">
            {money(ptpTotal)}
          </p>
        </section>
      </div>
      {error && <p className="text-red-700">{error}</p>}
      {lists.length > 0 && (
        <MasterlistShareChart
          lists={lists}
          open={masterlistChartOpen}
          onToggle={() => setMasterlistChartOpen((open) => !open)}
        />
      )}
      {collectorStats.length > 0 && (
        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => setCollectorsOpen((open) => !open)} className="text-left">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Collectors</h2>
              <p className="mt-1 text-sm text-slate-500">{collectorsOpen ? "Hide collector details" : "Show collector details"}</p>
            </button>
            {selectedCollector && (
              <button type="button" onClick={() => setSelectedCollector("")} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700">Show all</button>
            )}
          </div>
          {collectorsOpen && (
            <>
            <CollectorCharts collectors={collectorStats} />
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[760px] w-full text-left text-sm">
                <thead>
                  <tr>
                    {[
                      "COLLECTOR",
                      "CLIENTS",
                      "AMOUNT",
                      "CURRENT BALANCE",
                      "PAID",
                      "PTP",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="whitespace-nowrap border-b border-slate-200 bg-slate-200 px-3 py-2 font-semibold text-slate-800"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {collectorStats.map((collector) => {
                    const isSelected = selectedCollector === collector.name.toLowerCase();
                    return (
                      <tr
                        key={collector.name}
                        onClick={() => setSelectedCollector(isSelected ? "" : collector.name.toLowerCase())}
                        className="cursor-pointer border-b border-slate-100 last:border-0"
                        style={{
                          backgroundColor: isSelected ? "rgba(148, 163, 184, 0.12)" : "transparent",
                        }}
                      >
                        <td className="px-3 py-2 font-medium text-slate-800">{collector.name}</td>
                        <td className="px-3 py-2 text-slate-700">{collector.clients.toLocaleString()}</td>
                        <td className="px-3 py-2 text-slate-700">{money(collector.amount)}</td>
                        <td className="px-3 py-2 text-slate-700">{money(collector.balance)}</td>
                        <td className="px-3 py-2 text-slate-700">{money(collector.paid)}</td>
                        <td className="px-3 py-2 text-slate-700">{money(collector.ptp)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </section>
      )}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          All masterlists
        </h2>
        <span className="text-sm text-slate-500">{visibleLists.length} total</span>
      </div>
      {visibleLists.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleLists.map((item) => (
            <article
              key={item.id}
              className="group relative rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md"
            >
              <Link
                href={`/dashboard/${item.collectionName}`}
                aria-label={`Open ${item.masterlistName}`}
                className="absolute inset-0 z-0 rounded-lg"
              />
              <div className="relative z-10 pointer-events-none">
                <div className="flex items-start justify-between gap-3">
                {editingListId === item.id ? (
                  <form
                    className="pointer-events-auto flex min-w-0 flex-1 gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      saveName(item);
                    }}
                  >
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") cancelEditingName();
                      }}
                      className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 font-semibold text-emerald-950 outline-none focus:border-emerald-600 dark:border-slate-600 dark:bg-[#111817] dark:text-white"
                      aria-label="Masterlist name"
                    />
                    <button type="submit" disabled={savingName || !draftName.trim()} className="rounded-md bg-emerald-800 px-2 py-1 text-xs font-medium text-white disabled:opacity-40">Save</button>
                    <button type="button" onClick={cancelEditingName} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:text-slate-200">Cancel</button>
                  </form>
                ) : (
                  <h3 className="min-w-0 flex-1 font-semibold text-emerald-950 group-hover:text-emerald-700">
                    {item.masterlistName}
                  </h3>
                )}
                {editingListId !== item.id && <span className="text-xl text-emerald-700">-&gt;</span>}
                </div>
                {isAdmin && editingListId !== item.id && <button type="button" onClick={() => startEditingName(item)} className="pointer-events-auto mt-3 text-xs font-medium text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300">Edit name</button>}
                <div className="mt-8 border-t border-slate-100 pt-3">
                <div>
                  <span className="text-2xl font-semibold text-slate-800">
                    {item.count.toLocaleString()}
                  </span>
                  <span className="ml-2 text-sm text-slate-500">clients</span>
                </div>
                {item.collectibleField && (
                  <div className="mt-2 text-sm text-slate-600">
                    Current balance:{" "}
                    <span className="font-medium">
                      {money(item.collectibleTotal)}
                    </span>
                  </div>
                )}
                {item.paidTotal > 0 && (
                  <div className="mt-1 text-sm text-slate-600">
                    Paid:{" "}
                    <span className="font-medium">{money(item.paidTotal)}</span>
                  </div>
                )}
                {item.ptpTotal > 0 && (
                  <div className="mt-1 text-sm text-slate-600">
                    PTP:{" "}
                    <span className="font-medium">{money(item.ptpTotal)}</span>
                  </div>
                )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        !error && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-slate-500">
            No masterlists yet. Upload an Excel or CSV file to create your first
            one.
          </div>
        )
      )}
    </>
  );
}

export default function DashboardPage() {
  return (
    <AuthGate allowedRoles={["admin", "viewer"]}>
      <DashboardContent />
    </AuthGate>
  );
}
