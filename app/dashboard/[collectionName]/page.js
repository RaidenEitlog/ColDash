"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import AuthGate from "../../../components/AuthGate";
import CollectorCharts from "../../../components/CollectorCharts";
import { getUserRole } from "../../../lib/getUserRole";
import { auth, db } from "../../../lib/firebase";
import { findCollectibleField } from "../../../lib/findCollectibleField";

function numberValue(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}
function formatAmount(value) {
  return numberValue(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function formatValue(value, type) {
  if (value === null || value === undefined) return "";
  if (type === "accounting") return formatAmount(value);
  return String(value);
}
function getCurrentBalance(record, amountField) {
  return Math.max(
    0,
    numberValue(record[amountField]) - numberValue(record.amountPaid),
  );
}
function getPredictedBalance(record, amountField) {
  return Math.max(
    0,
    getCurrentBalance(record, amountField) - numberValue(record.ptp),
  );
}
function getEffectivePtp(record, amountField) {
  return getCurrentBalance(record, amountField) === 0 ? 0 : numberValue(record.ptp);
}

function getCollectorField(headers) {
  return headers.find((header) => String(header).trim().toLowerCase() === "collector") || "";
}

function buildSummaryFromRecords(records, amountField, collectorField) {
  const collectorMap = new Map();
  let totalClients = 0;
  let collectibleTotal = 0;
  let paidTotal = 0;
  let ptpTotal = 0;

  records.forEach((record) => {
    totalClients += 1;
    const amountValue = numberValue(record[amountField]);
    const paidValue = numberValue(record.amountPaid);
    const ptpValue = numberValue(record.ptp);

    collectibleTotal += Math.max(0, amountValue - paidValue);
    paidTotal += paidValue;
    ptpTotal += ptpValue;

    if (!collectorField) return;

    const name = String(record[collectorField] || "Unassigned").trim() || "Unassigned";
    const key = name.toLowerCase();
    const current = collectorMap.get(key) || {
      name,
      clients: 0,
      amount: 0,
      balance: 0,
      paid: 0,
      ptp: 0,
    };

    current.clients += 1;
    current.amount += amountValue;
    current.balance += Math.max(0, amountValue - paidValue);
    current.paid += paidValue;
    current.ptp += ptpValue;
    collectorMap.set(key, current);
  });

  return {
    count: totalClients,
    collectibleTotal,
    paidTotal,
    ptpTotal,
    collectorStats: [...collectorMap.values()].sort((left, right) => right.ptp - left.ptp),
  };
}

async function persistRegistrySummary(registryId, records, amountField, collectorField) {
  if (!registryId) return;
  const summary = buildSummaryFromRecords(records, amountField, collectorField);
  await updateDoc(doc(db, "masterlist_registry", registryId), { summary });
}

async function refreshRegistrySummary(registryId, collectionName, amountField, collectorField) {
  if (!registryId) return;
  const snapshot = await getDocs(collection(db, collectionName));
  const records = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  await persistRegistrySummary(registryId, records, amountField, collectorField);
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/35 px-4 py-6"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl border border-slate-300 border-t-4 border-t-emerald-600 bg-white p-7 shadow-2xl dark:border-slate-600 dark:bg-[#24312d]"><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Confirm action</p><h2 className="mt-2 text-xl font-semibold text-emerald-950 dark:text-white">Are you sure?</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{message}</p><div className="mt-7 flex justify-end gap-3"><button type="button" onClick={onCancel} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-200">No, cancel</button><button type="button" onClick={onConfirm} className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-medium text-white">Yes, continue</button></div></div></div>;
}

function AmountEditor({ record, collectionName, field, label, onSaved, getAdditionalUpdates }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const numericAmount = numberValue(amount);
  async function save() {
    setSaving(true);
    setError("");
    try {
      const updates = { [field]: numericAmount, ...(getAdditionalUpdates ? getAdditionalUpdates(numericAmount) : {}) };
      await updateDoc(doc(db, collectionName, record.id), updates);
      onSaved(numericAmount, updates);
      setOpen(false);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }
  if (!open)
    return (
      <button
        type="button"
        onClick={() => {
          setAmount("");
          setReview(false);
          setError("");
          setOpen(true);
        }}
        className="rounded-md border border-emerald-700 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
      >
        {label}
      </button>
    );
  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-xl border border-slate-300 border-t-4 border-t-emerald-600 bg-white p-7 shadow-2xl dark:border-slate-600 dark:border-t-emerald-500 dark:bg-[#24312d]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              Admin update
            </p>
            <h2 className="mt-1 text-xl font-semibold text-emerald-950 dark:text-white">
              {field === "ptp" ? "Set Promise to Pay" : "Add Amount Paid"}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
              {field === "ptp"
                ? "Record the promised amount. It does not reduce the current balance."
                : "Record a payment received from this client."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close dialog"
            className="rounded-md px-2 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white"
          >
            &times;
          </button>
        </div>
        {!review ? (
          <>
            <label className="mt-7 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Amount
              <input
                autoFocus
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-lg text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-600 dark:bg-[#111817] dark:text-white"
              />
            </label>
            <div className="mt-7 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={numericAmount <= 0}
                onClick={() => setReview(true)}
                className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Review amount
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-7 rounded-md bg-emerald-50 p-4 text-slate-700 dark:bg-emerald-950/50 dark:text-slate-200">
              Are you sure it is{" "}
              <strong className="text-lg text-emerald-900 dark:text-white">
                {formatAmount(numericAmount)}
              </strong>
              ?
            </p>
            <div className="mt-7 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setReview(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-200"
              >
                Change
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {saving ? "Saving..." : "Confirm and save"}
              </button>
            </div>
          </>
        )}
        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      </div>
    </div></>
  );
}

function EditClient({ record, headers, collectionName, onSaved }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  function openEditor() {
    setValues(Object.fromEntries([...headers, "amountPaid", "ptp"].map((field) => [field, record[field] ?? ""])));
    setError("");
    setOpen(true);
  }
  async function save() {
    setSaving(true);
    setError("");
    try {
      const updates = Object.fromEntries(Object.entries(values).map(([field, value]) => [field, ["amountPaid", "ptp"].includes(field) ? numberValue(value) : value]));
      await updateDoc(doc(db, collectionName, record.id), updates);
      onSaved(updates);
      setOpen(false);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }
  return <>
    {confirmOpen && <ConfirmDialog message="Save these client changes?" onCancel={() => setConfirmOpen(false)} onConfirm={() => { setConfirmOpen(false); save(); }} />}
    <button type="button" onClick={openEditor} className="rounded-md border border-emerald-700 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50">Edit client</button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6"><div role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-300 border-t-4 border-t-emerald-600 bg-white p-7 shadow-2xl dark:border-slate-600 dark:bg-[#24312d]"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Admin update</p><h2 className="mt-1 text-xl font-semibold text-emerald-950 dark:text-white">Edit client</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close dialog" className="rounded-md px-2 text-xl leading-none text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">&times;</button></div><div className="mt-6 grid gap-4 sm:grid-cols-2">{[...headers, "amountPaid", "ptp"].map((field) => <label key={field} className="block text-sm font-medium text-slate-700 dark:text-slate-200">{field}<input value={values[field] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-[#111817] dark:text-white" /></label>)}</div>{error && <p className="mt-4 text-sm text-red-700">{error}</p>}<div className="mt-7 flex justify-end gap-3"><button type="button" onClick={() => setOpen(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-200">Cancel</button><button type="button" disabled={saving} onClick={() => setConfirmOpen(true)} className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{saving ? "Saving..." : "Save changes"}</button></div></div></div>}
  </>;
}

function DeleteClient({ record, collectionName, onDeleted }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setDeleting(true);
    setError("");
    try {
      await deleteDoc(doc(db, collectionName, record.id));
      onDeleted(record.id);
      setConfirmOpen(false);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {confirmOpen && (
        <ConfirmDialog
          message="Delete this client and all of its recorded values? This cannot be undone."
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleDelete}
        />
      )}
      <button
        type="button"
        onClick={() => {
          setError("");
          setConfirmOpen(true);
        }}
        disabled={deleting}
        className="rounded-md border border-red-700 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950/30"
      >
        {deleting ? "Deleting..." : "Delete client"}
      </button>
      {error && <p className="absolute mt-8 text-xs text-red-700 dark:text-red-400">{error}</p>}
    </>
  );
}

function PaidFlagAction({ record, collectionName, onSaved }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  async function toggleFlag() {
    setSaving(true);
    try {
      const isPaid = !record.isPaid;
      await updateDoc(doc(db, collectionName, record.id), { isPaid });
      onSaved(isPaid);
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  }
  return <>{confirmOpen && <ConfirmDialog message={`${record.isPaid ? "Remove the paid flag from" : "Flag"} this client?`} onCancel={() => setConfirmOpen(false)} onConfirm={toggleFlag} />}<button type="button" onClick={() => setConfirmOpen(true)} disabled={saving} className="rounded-md border border-emerald-700 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50">{record.isPaid ? "Unflag" : "Flag as paid"}</button></>;
}

function DeleteMasterlist({ collectionName, registryId, onDeleted }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) setIsAdmin((await getUserRole(user)) === "admin");
    });
    return unsubscribe;
  }, []);
  if (!isAdmin || !registryId) return null;
  const expected = `deletemasterlist_${collectionName}`;
  async function handleDelete() {
    if (confirmation !== expected) return;
    setDeleting(true);
    setError("");
    try {
      const snapshot = await getDocs(collection(db, collectionName));
      for (let start = 0; start < snapshot.docs.length; start += 500) {
        const batch = writeBatch(db);
        snapshot.docs
          .slice(start, start + 500)
          .forEach((item) => batch.delete(item.ref));
        await batch.commit();
      }
      await deleteDoc(doc(db, "masterlist_registry", registryId));
      onDeleted();
    } catch (deleteError) {
      setError(deleteError.message);
      setDeleting(false);
    }
  }
  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Delete masterlist
        </button>
      )}
      {open && (
        <div className="mt-5 max-w-xl rounded-lg border border-red-200 bg-red-50 p-5">
          <h2 className="font-semibold text-red-900">
            Are you sure you want to delete this masterlist?
          </h2>
          <p className="mt-2 text-sm text-red-800">
            This permanently deletes the masterlist and all records.
          </p>
          <label className="mt-4 block text-sm text-red-900">
            Type: <span className="font-mono font-semibold">{expected}</span>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="mt-1 w-full rounded-md border border-red-300 bg-white px-3 py-2 font-mono text-sm"
            />
          </label>
          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={handleDelete}
              disabled={confirmation !== expected || deleting}
              className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {deleting ? "Deleting..." : "Delete permanently"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirmation("");
                setError("");
              }}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function CollectionContent({ collectionName }) {
  const router = useRouter();
  const [records, setRecords] = useState([]);
  const [registry, setRegistry] = useState(null);
  const [role, setRole] = useState("viewer");
  const [error, setError] = useState("");
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const pageCursorsRef = useRef([null]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [selectedCollector, setSelectedCollector] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [collectorsOpen, setCollectorsOpen] = useState(false);
  const [savingThemeField, setSavingThemeField] = useState("");
  useEffect(() => {
    const authUnsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) setRole(await getUserRole(user));
    });
    const registryUnsubscribe = onSnapshot(
      query(
        collection(db, "masterlist_registry"),
        where("collectionName", "==", collectionName),
      ),
      (registrySnapshot) => {
        const registryDocument = registrySnapshot.docs[0];
        setRegistry(
          registryDocument
            ? { id: registryDocument.id, ...registryDocument.data() }
            : null,
        );
      },
      (loadError) => {
        setError(loadError.message);
      },
    );

    return () => {
      authUnsubscribe();
      registryUnsubscribe();
    };
  }, [collectionName]);
  const rawHeaders = registry?.fieldNames?.length
    ? registry.fieldNames
    : records.length
      ? Object.keys(records[0]).filter(
          (key) => key !== "id" && key !== "amountPaid" && key !== "ptp",
        )
      : [];
  const headers = [...new Set(rawHeaders)];
  const fieldTypes = registry?.fieldTypes || {};
  const headerColor = registry?.themeColor || "#006b57";
  const flagThemeColor = registry?.flagTheme || "#d1fae5";
  const unflagThemeColor = registry?.unflagTheme || "#fef3c7";
  const displayName =
    registry?.masterlistName ||
    collectionName
      .replace(/_[a-z0-9]{6}$/, "")
      .replace(/_/g, " ")
      .toUpperCase();
  const amountField =
    findCollectibleField(registry) ||
    headers.find((header) => /^amount$/i.test(header)) ||
    "";
  const collectorField = getCollectorField(headers);
  useEffect(() => {
    let isMounted = true;
    async function loadRecords() {
      const cursor = pageCursorsRef.current[currentPage - 1];
      if (currentPage > 1 && !cursor) return;
      setRecordsLoading(true);
      try {
        const constraints = [];
        if (selectedCollector && collectorField) {
          constraints.push(where(collectorField, "==", selectedCollector));
        }
        if (cursor) constraints.push(startAfter(cursor));
        constraints.push(limit(pageSize));
        const recordsSnapshot = await getDocs(query(collection(db, collectionName), ...constraints));
        if (!isMounted) return;
        setRecords(
          recordsSnapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
            amountPaid: item.data().amountPaid || 0,
            ptp: item.data().ptp || 0,
            isPaid: item.data().isPaid || false,
          })),
        );
        const lastDocument = recordsSnapshot.docs.at(-1);
        if (lastDocument) pageCursorsRef.current[currentPage] = lastDocument;
        setHasNextPage(recordsSnapshot.docs.length === pageSize);
        setError("");
      } catch (loadError) {
        if (isMounted) setError(loadError.message);
      } finally {
        if (isMounted) setRecordsLoading(false);
      }
    }
    loadRecords();
    return () => {
      isMounted = false;
    };
  }, [collectionName, currentPage, pageSize, selectedCollector, collectorField]);
  const summary = registry?.summary || {};
  const collectorStats = Array.isArray(summary.collectorStats) ? summary.collectorStats : [];
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredRecords = normalizedSearchTerm
    ? records.filter((record) =>
        Object.values(record).some((value) =>
          String(value ?? "").toLowerCase().includes(normalizedSearchTerm),
        ),
      )
    : records;
  const collectibleTotal = numberValue(summary.collectibleTotal);
  const paidTotal = numberValue(summary.paidTotal);
  const ptpTotal = numberValue(summary.ptpTotal);
  const balanceTotal = collectibleTotal;
  const selectedCollectorSummary = collectorStats.find(
    (collector) => String(collector.name).trim().toLowerCase() === selectedCollector.toLowerCase(),
  );
  const totalClientCount = selectedCollector
    ? Number(selectedCollectorSummary?.clients || 0)
    : Number(summary.count || 0);
  const rangeStart = records.length ? (currentPage - 1) * pageSize + 1 : 0;
  const rangeEnd = records.length ? rangeStart + records.length - 1 : 0;
  const visibleRecords = filteredRecords;
  async function changeTheme(fieldName, nextColor) {
    setRegistry((current) => ({ ...current, [fieldName]: nextColor }));
    if (!registry?.id) return;
    setSavingThemeField(fieldName);
    try {
      await updateDoc(doc(db, "masterlist_registry", registry.id), {
        [fieldName]: nextColor,
      });
    } catch (themeError) {
      setError(themeError.message);
    } finally {
      setSavingThemeField("");
    }
  }
  function hexToRgb(hex) {
    const normalized = hex.replace("#", "");
    if (normalized.length !== 6) return null;
    const value = Number.parseInt(normalized, 16);
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255,
    };
  }
  function rgbToHex({ r, g, b }) {
    return `#${[r, g, b]
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")}`;
  }
  function mixRgb(base, target, weight) {
    return {
      r: Math.round(base.r * (1 - weight) + target.r * weight),
      g: Math.round(base.g * (1 - weight) + target.g * weight),
      b: Math.round(base.b * (1 - weight) + target.b * weight),
    };
  }
  function getAdaptiveHighlight(baseColor) {
    const rgb = hexToRgb(baseColor);
    if (!rgb) return baseColor;
    const isDark = document?.documentElement?.classList?.contains("dark");
    const blendTarget = isDark ? { r: 255, g: 255, b: 255 } : { r: 16, g: 22, b: 18 };
    const blended = mixRgb(rgb, blendTarget, isDark ? 0.38 : 0.3);
    return rgbToHex(blended);
  }
  function getHighlightColor(record) {
    if (getCurrentBalance(record, amountField) !== 0) return "transparent";
    const baseColor = record.isPaid ? flagThemeColor : unflagThemeColor;
    return getAdaptiveHighlight(baseColor);
  }
  function getRowHighlightStyle(record) {
    const shouldHighlight = getCurrentBalance(record, amountField) === 0;
    return shouldHighlight
      ? {
          backgroundColor: getHighlightColor(record),
          color: document?.documentElement?.classList?.contains("dark") ? "#e5eee9" : "#17221d",
        }
      : undefined;
  }
  function updateRow(record, field, value) {
    setRecords((current) =>
      current.map((item) =>
        item.id === record.id ? { ...item, [field]: value } : item,
      ),
    );
    if (registry?.id) {
      refreshRegistrySummary(registry.id, collectionName, amountField, collectorField);
    }
  }
  function handlePaymentSaved(record, value, updates) {
    const nextRecord = { ...record, ...updates };
    setRecords((current) =>
      current.map((item) => item.id === record.id ? nextRecord : item),
    );
    if (registry?.id) {
      refreshRegistrySummary(registry.id, collectionName, amountField, collectorField);
    }
  }
  function handleRecordSaved(updates) {
    setRecords((current) => current.map((item) => item.id === updates.id ? { ...item, ...updates } : item));
    if (registry?.id) {
      refreshRegistrySummary(registry.id, collectionName, amountField, collectorField);
    }
  }
  function handleRecordDeleted(recordId) {
    const nextRecords = records.filter((item) => item.id !== recordId);
    setRecords(nextRecords);
    if (registry?.id) {
      refreshRegistrySummary(registry.id, collectionName, amountField, collectorField);
    }
  }
  return (
    <>
      <Link
        href="/dashboard"
        style={{ color: headerColor }}
        className="mb-6 inline-block text-sm font-medium hover:opacity-75"
      >
        &lt;- Back to all masterlists
      </Link>
      <div className="mb-8">
        <p
          style={{ color: headerColor }}
          className="text-sm font-semibold uppercase tracking-widest"
        >
          Masterlist
        </p>
        <h1 className="mt-2 text-3xl font-semibold uppercase text-emerald-950">
          {displayName}
        </h1>
        <div className="mt-3 flex flex-wrap gap-6 text-slate-500">
          <span>
            <strong className="text-2xl font-semibold text-emerald-950">
              {totalClientCount.toLocaleString()}
            </strong>{" "}
            clients
          </span>
          <span>
            <strong className="text-2xl font-semibold text-emerald-950">
              {formatAmount(balanceTotal)}
            </strong>{" "}
            current balance
          </span>
          <span>
            <strong className="text-2xl font-semibold text-emerald-950">
              {formatAmount(paidTotal)}
            </strong>{" "}
            paid
          </span>
          <span>
            <strong className="text-2xl font-semibold text-emerald-950">
              {formatAmount(ptpTotal)}
            </strong>{" "}
            PTP
          </span>
        </div>
      </div>
      {role === "admin" && (
        <div className="mb-5 flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            Masterlist Theme
            <input
              type="color"
              value={headerColor}
              onChange={(event) => changeTheme("themeColor", event.target.value)}
              className="h-9 w-14 cursor-pointer rounded border border-slate-300 p-1"
            />
          </label>
          <label className="flex items-center gap-2">
            Flag Theme
            <input
              type="color"
              value={flagThemeColor}
              onChange={(event) => changeTheme("flagTheme", event.target.value)}
              className="h-9 w-14 cursor-pointer rounded border border-slate-300 p-1"
            />
          </label>
          <label className="flex items-center gap-2">
            Unflag Theme
            <input
              type="color"
              value={unflagThemeColor}
              onChange={(event) => changeTheme("unflagTheme", event.target.value)}
              className="h-9 w-14 cursor-pointer rounded border border-slate-300 p-1"
            />
          </label>
          {savingThemeField && <span className="text-slate-500">Saving...</span>}
        </div>
      )}
      {error && <p className="mb-4 text-red-700">{error}</p>}
      <div className="mb-5">
        <DeleteMasterlist
          collectionName={collectionName}
          registryId={registry?.id}
          onDeleted={() => router.push("/dashboard")}
        />
      </div>
      {collectorField && collectorStats.length > 0 && (
        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => setCollectorsOpen((open) => !open)} className="text-left">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Collectors</h2>
              <p className="mt-1 text-sm text-slate-500">{collectorsOpen ? "Hide collector details" : "Show collector details"}</p>
            </button>
            {selectedCollector && <button type="button" onClick={() => { setSelectedCollector(""); setCurrentPage(1); pageCursorsRef.current = [null]; }} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700">Show all</button>}
          </div>
          {collectorsOpen && <div className="mt-4 overflow-x-auto">
            <CollectorCharts collectors={collectorStats} />
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead><tr>{["COLLECTOR", "CLIENTS", "AMOUNT", "CURRENT BALANCE", "PAID", "PTP"].map((heading) => <th key={heading} style={{ backgroundColor: headerColor }} className="whitespace-nowrap px-3 py-2 font-semibold text-white">{heading}</th>)}</tr></thead>
              <tbody>{collectorStats.map((collector) => {
                const isSelected = selectedCollector === collector.name;
                const isDark = document?.documentElement?.classList?.contains("dark");
                return (
                  <tr
                    key={collector.name}
                    className="cursor-pointer border-b border-slate-100 last:border-0"
                    style={{
                      backgroundColor: isSelected
                        ? isDark
                          ? "rgba(148, 163, 184, 0.12)"
                          : "rgba(148, 163, 184, 0.08)"
                        : "transparent",
                    }}
                    onClick={() => {
                      setSelectedCollector(isSelected ? "" : collector.name);
                      setCurrentPage(1);
                      pageCursorsRef.current = [null];
                    }}
                  >
                    <td className="px-3 py-2 font-medium text-slate-800">{collector.name}</td>
                    <td className="px-3 py-2 text-slate-700">{collector.clients.toLocaleString()}</td>
                    <td className="px-3 py-2 text-slate-700">{formatAmount(collector.amount)}</td>
                    <td className="px-3 py-2 text-slate-700">{formatAmount(collector.balance)}</td>
                    <td className="px-3 py-2 text-slate-700">{formatAmount(collector.paid)}</td>
                    <td className="px-3 py-2 text-slate-700">{formatAmount(collector.ptp)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>}
        </section>
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
        <span>
          Showing {normalizedSearchTerm ? `${filteredRecords.length} matching rows on this page` : `${rangeStart}-${rangeEnd} of ${totalClientCount.toLocaleString()}`} {" "}
          clients
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            Search loaded rows
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search..."
              className="w-48 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-slate-800 outline-none focus:border-emerald-600"
              aria-label="Search loaded rows"
            />
          </label>
          <label className="flex items-center gap-2">
            Rows per page
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Math.min(50, Number(event.target.value)));
                setCurrentPage(1);
                pageCursorsRef.current = [null];
              }}
              className="rounded-md border border-slate-300 bg-white px-2 py-1"
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </label>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-[1200px] w-full text-left text-sm">
          <thead>
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  style={{ backgroundColor: headerColor }}
                  className="whitespace-nowrap px-4 py-3 font-semibold text-white"
                >
                  {header}
                </th>
              ))}
              <th
                style={{ backgroundColor: headerColor }}
                className="whitespace-nowrap px-4 py-3 font-semibold text-white"
              >
                AMOUNT PAID
              </th>
              <th
                style={{ backgroundColor: headerColor }}
                className="whitespace-nowrap px-4 py-3 font-semibold text-white"
              >
                CURRENT BALANCE
              </th>
              <th
                style={{ backgroundColor: headerColor }}
                className="whitespace-nowrap px-4 py-3 font-semibold text-white"
              >
                PTP
              </th>
              <th
                style={{ backgroundColor: headerColor }}
                className="whitespace-nowrap px-4 py-3 font-semibold text-white"
              >
                PREDICTED BALANCE
              </th>
              {role === "admin" && (
                <th
                  style={{ backgroundColor: headerColor }}
                  className="sticky right-0 z-20 w-[220px] min-w-[220px] border-l border-white/20 px-4 py-3 font-semibold text-white"
                >
                  ACTION
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {visibleRecords.map((record) => (
              <tr
                key={record.id}
                style={getRowHighlightStyle(record)}
                className="border-b border-slate-100 last:border-0"
              >
                {headers.map((header) => (
                  <td
                    key={header}
                    style={
                      getCurrentBalance(record, amountField) === 0
                        ? { backgroundColor: getHighlightColor(record) }
                        : undefined
                    }
                    className="whitespace-nowrap px-4 py-3 text-slate-700"
                  >
                    {formatValue(record[header], fieldTypes[header])}
                  </td>
                ))}
                <td
                  style={
                    getCurrentBalance(record, amountField) === 0
                      ? { backgroundColor: getHighlightColor(record) }
                      : undefined
                  }
                  className="whitespace-nowrap px-4 py-3 font-medium text-slate-700"
                >
                  {formatAmount(record.amountPaid)}
                </td>
                <td
                  style={
                    getCurrentBalance(record, amountField) === 0
                      ? { backgroundColor: getHighlightColor(record) }
                      : undefined
                  }
                  className="whitespace-nowrap px-4 py-3 font-medium text-slate-700"
                >
                  {formatAmount(getCurrentBalance(record, amountField))}
                </td>
                <td
                  style={
                    getCurrentBalance(record, amountField) === 0
                      ? { backgroundColor: getHighlightColor(record) }
                      : undefined
                  }
                  className="whitespace-nowrap px-4 py-3 font-medium text-slate-700"
                >
                  {formatAmount(getEffectivePtp(record, amountField))}
                </td>
                <td
                  style={
                    getCurrentBalance(record, amountField) === 0
                      ? { backgroundColor: getHighlightColor(record) }
                      : undefined
                  }
                  className="whitespace-nowrap px-4 py-3 font-medium text-slate-700"
                >
                  {formatAmount(getPredictedBalance(record, amountField))}
                </td>
                {role === "admin" && (
                  <td
                    style={
                      getCurrentBalance(record, amountField) === 0
                        ? { backgroundColor: getHighlightColor(record) }
                        : undefined
                    }
                    className="sticky right-0 z-10 w-[220px] min-w-[220px] border-l border-slate-200 bg-white px-4 py-3 dark:border-slate-600 dark:bg-[#1b2522]"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      {getCurrentBalance(record, amountField) === 0 ? <PaidFlagAction record={record} collectionName={collectionName} onSaved={(value) => updateRow(record, "isPaid", value)} /> : <AmountEditor record={record} collectionName={collectionName} field="amountPaid" label="Add paid" onSaved={(value, updates) => handlePaymentSaved(record, value, updates)} getAdditionalUpdates={(value) => { const nextPaid = numberValue(record.amountPaid) + value; return { amountPaid: nextPaid, ptp: Math.max(0, numberValue(record.ptp) - value) }; }} />}
                      {getCurrentBalance(record, amountField) > 0 && <AmountEditor record={record} collectionName={collectionName} field="ptp" label="Set PTP" onSaved={(value) => updateRow(record, "ptp", value)} />}
                      <EditClient record={record} headers={headers} collectionName={collectionName} onSaved={(updates) => handleRecordSaved({ ...updates, id: record.id })} />
                      <DeleteClient record={record} collectionName={collectionName} onDeleted={handleRecordDeleted} />
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!filteredRecords.length && !error && (
          <p className="px-4 py-8 text-slate-500">No documents found.</p>
        )}
      </div>
      {totalClientCount > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-slate-500">
            Page {currentPage}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((page) => page - 1)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="px-2 text-slate-500">Page {currentPage}</span>
            <button
              type="button"
              disabled={!hasNextPage || recordsLoading}
              onClick={() => setCurrentPage((page) => page + 1)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function CollectionPage({ params }) {
  const { collectionName } = use(params);
  return (
    <AuthGate allowedRoles={["admin", "viewer"]}>
      <CollectionContent collectionName={collectionName} />
    </AuthGate>
  );
}
