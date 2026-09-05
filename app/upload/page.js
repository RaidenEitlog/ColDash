"use client";

import Link from "next/link";
import { useState } from "react";
import readXlsxFile from "read-excel-file/browser";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import AuthGate from "../../components/AuthGate";
import { db } from "../../lib/firebase";

function toNumber(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildSummary(rows, collectibleField, fieldNames) {
  const collectorField = fieldNames.find((header) => String(header).trim().toLowerCase() === "collector") || "";
  const collectorMap = new Map();
  let totalClients = 0;
  let collectibleTotal = 0;
  let paidTotal = 0;
  let ptpTotal = 0;

  rows.forEach((row) => {
    totalClients += 1;
    const amountValue = toNumber(row[collectibleField || ""]);
    const paidValue = toNumber(row.amountPaid);
    const ptpValue = toNumber(row.ptp);

    collectibleTotal += Math.max(0, amountValue - paidValue);
    paidTotal += paidValue;
    ptpTotal += ptpValue;

    if (!collectorField) return;

    const name = String(row[collectorField] || "Unassigned").trim() || "Unassigned";
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

function collectionNameFor() {
  return `masterlist_${crypto.randomUUID().replace(/-/g, "")}`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];
    if (character === '"' && quoted && nextCharacter === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function UploadContent() {
  const [masterlistName, setMasterlistName] = useState("");
  const [monthYear, setMonthYear] = useState("");
  const [fields, setFields] = useState([]);
  const [rows, setRows] = useState([]);
  const [fieldTypes, setFieldTypes] = useState({});
  const [collectibleField, setCollectibleField] = useState("");
  const [themeColor, setThemeColor] = useState("#006b57");
  const [flagTheme, setFlagTheme] = useState("#d1fae5");
  const [unflagTheme, setUnflagTheme] = useState("#fef3c7");
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = file.name.toLowerCase().endsWith(".csv")
        ? parseCsv(await file.text())
        : await readXlsxFile(file);
      const [header = [], ...body] = data;
      const detectedFields = header.map(String);
      setFields(detectedFields);
      setFieldTypes(
        Object.fromEntries(detectedFields.map((field) => [field, "general"])),
      );
      setCollectibleField("");
      setRows(
        body
          .filter((row) => row.some((value) => value !== ""))
          .map((row) =>
            Object.fromEntries(
              detectedFields.map((field, index) => [field, row[index] ?? ""]),
            ),
          ),
      );
      setError("");
    } catch (fileError) {
      setError(fileError.message);
    }
  }

  function dropField(targetIndex) {
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    const nextFields = [...fields];
    const [movedField] = nextFields.splice(draggedIndex, 1);
    nextFields.splice(targetIndex, 0, movedField);
    setFields(nextFields);
    setDraggedIndex(null);
  }

  function requestCreate(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!masterlistName || !monthYear || !fields.length) {
      setError("Add a name, month-year, and a file with columns.");
      return;
    }
    setConfirmOpen(true);
  }

  async function createMasterlist() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const dateLabel = new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
      })
        .format(
          new Date(
            Number(monthYear.slice(0, 4)),
            Number(monthYear.slice(5, 7)) - 1,
          ),
        )
        .toUpperCase();
      const displayName = `${masterlistName.trim()} ${dateLabel}`;
      const name = collectionNameFor();
      const summary = buildSummary(rows, collectibleField, fields);
      await addDoc(collection(db, "masterlist_registry"), {
        masterlistName: displayName,
        createdAt: serverTimestamp(),
        fieldNames: fields,
        fieldTypes,
        collectibleField,
        themeColor,
        flagTheme,
        unflagTheme,
        collectionName: name,
        summary,
      });
      for (let start = 0; start < rows.length; start += 500) {
        const batch = writeBatch(db);
        rows.slice(start, start + 500).forEach((row) => {
          const values = Object.fromEntries(
            fields.map((field) => [field, row[field] ?? ""]),
          );
          batch.set(doc(collection(db, name)), values);
        });
        await batch.commit();
      }
      setMessage("Masterlist created successfully.");
      setRows([]);
      setFields([]);
      setConfirmOpen(false);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  const dateLabel = monthYear
    ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" })
        .format(
          new Date(
            Number(monthYear.slice(0, 4)),
            Number(monthYear.slice(5, 7)) - 1,
          ),
        )
        .toUpperCase()
    : "MONTH YEAR";
  return (
    <>
      {confirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl border border-slate-300 border-t-4 border-t-emerald-600 bg-white p-7 shadow-2xl dark:border-slate-600 dark:bg-[#24312d]">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Confirm action</p>
            <h2 className="mt-2 text-xl font-semibold text-emerald-950 dark:text-white">Create masterlist?</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Create &quot;{masterlistName.trim()}&quot; with {rows.length} clients?</p>
            <div className="mt-7 flex justify-end gap-3"><button type="button" onClick={() => setConfirmOpen(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-200">No, cancel</button><button type="button" onClick={createMasterlist} disabled={saving} className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{saving ? "Creating..." : "Yes, continue"}</button></div>
          </div>
        </div>
      )}
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">
          Admin
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-emerald-950">
          Create masterlist
        </h1>
        <p className="mt-2 text-slate-500">
          Upload a file and customize its online layout.
        </p>
      </div>
      <form
        onSubmit={requestCreate}
        className="space-y-6 rounded-lg border border-slate-200 bg-white p-6"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm">
            Masterlist Name
            <input
              required
              placeholder="MASTERLIST NAME"
              value={masterlistName}
              onChange={(event) => setMasterlistName(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Month / Year
            <input
              required
              type="month"
              value={monthYear}
              onChange={(event) => setMonthYear(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <p className="-mt-2 text-xs text-slate-500">
          Displayed name:{" "}
          {masterlistName
            ? `${masterlistName.trim()} ${dateLabel}`
            : `Masterlist Name ${dateLabel}`}
        </p>
        <label className="block text-sm">
          Excel or CSV file
          <input
            required
            type="file"
            accept=".xlsx,.csv"
            onChange={handleFile}
            className="mt-1 block w-full rounded-md border border-dashed border-slate-300 px-3 py-4 text-sm"
          />
        </label>
        {fields.length > 0 && (
          <section className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4">
            <div>
              <h2 className="font-semibold text-emerald-950">
                Masterlist setup
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Drag columns to reorder them. This layout will be used on the
                dashboard.
              </p>
            </div>
            <label className="flex items-center gap-3 text-sm">
              Masterlist Theme
              <input
                type="color"
                value={themeColor}
                onChange={(event) => setThemeColor(event.target.value)}
                className="h-10 w-16 cursor-pointer rounded border border-slate-300 bg-white p-1"
              />
              <span className="font-mono text-xs text-slate-500">
                {themeColor}
              </span>
            </label>
            <label className="flex items-center gap-3 text-sm">
              Flag theme
              <input
                type="color"
                value={flagTheme}
                onChange={(event) => setFlagTheme(event.target.value)}
                className="h-10 w-16 cursor-pointer rounded border border-slate-300 bg-white p-1"
              />
              <span className="font-mono text-xs text-slate-500">
                {flagTheme}
              </span>
            </label>
            <label className="flex items-center gap-3 text-sm">
              Unflag theme
              <input
                type="color"
                value={unflagTheme}
                onChange={(event) => setUnflagTheme(event.target.value)}
                className="h-10 w-16 cursor-pointer rounded border border-slate-300 bg-white p-1"
              />
              <span className="font-mono text-xs text-slate-500">
                {unflagTheme}
              </span>
            </label>
            <label className="block text-sm">
              Total Collectible Amount
              <select
                value={collectibleField}
                onChange={(event) => setCollectibleField(event.target.value)}
                className="mt-1 rounded-md border border-slate-300 bg-white px-3 py-2"
              >
                <option value="">Do not calculate</option>
                {fields.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">
                Choose the column to sum on the dashboard.
              </span>
            </label>
            <div>
              <p className="mb-2 text-sm font-medium">
                Column order and formats
              </p>
              <div className="space-y-2">
                {fields.map((field, index) => (
                  <div
                    key={`${field}-${index}`}
                    draggable
                    onDragStart={() => setDraggedIndex(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => dropField(index)}
                    className="flex cursor-grab flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-2 active:cursor-grabbing"
                  >
                    <span className="w-6 text-center font-semibold text-slate-400">
                      {index + 1}
                    </span>
                    <span className="text-slate-400">::</span>
                    <span className="min-w-32 flex-1 font-medium text-slate-700">
                      {field}
                    </span>
                    <select
                      value={fieldTypes[field] || "general"}
                      onChange={(event) =>
                        setFieldTypes({
                          ...fieldTypes,
                          [field]: event.target.value,
                        })
                      }
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                    >
                      <option value="general">General</option>
                      <option value="accounting">Accounting</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr>
                    {fields.map((field) => (
                      <th
                        key={field}
                        style={{ backgroundColor: themeColor }}
                        className="whitespace-nowrap px-3 py-2 font-semibold text-white"
                      >
                        {field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 3).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {fields.map((field) => (
                        <td
                          key={field}
                          className="whitespace-nowrap border-t border-slate-100 px-3 py-2 text-slate-700"
                        >
                          {String(row[field] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        {message && (
          <p className="text-sm text-emerald-700">
            {message}{" "}
            <Link href="/dashboard" className="font-medium underline">
              View dashboard
            </Link>
          </p>
        )}
        <button
          disabled={saving}
          className="rounded-md bg-emerald-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? "Creating..." : "Create masterlist"}
        </button>
      </form>
    </>
  );
}

export default function UploadPage() {
  return (
    <AuthGate allowedRoles={["admin"]}>
      <UploadContent />
    </AuthGate>
  );
}
