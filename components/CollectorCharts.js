"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useState } from "react";

const COLORS = ["#00a878", "#f2b134", "#e45756", "#4c78a8", "#8e6bbf", "#5ab1bb"];

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function MetricChart({ title, collectors, field }) {
  const [hoveredCollector, setHoveredCollector] = useState("");
  const data = collectors
    .map((collector) => ({
      name: collector.name,
      value: Number(collector[field] || 0),
    }))
    .filter((item) => item.value > 0);

  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-600 dark:bg-[#17201e]">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      {data.length > 0 ? (
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart onMouseLeave={() => setHoveredCollector("")}>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="45%"
                innerRadius="20%"
                outerRadius="74%"
                paddingAngle={2}
                onMouseEnter={(_, index) => setHoveredCollector(data[index]?.name || "")}
              >
                {data.map((item, index) => (
                  <Cell
                    key={item.name}
                    fill={COLORS[index % COLORS.length]}
                    style={{
                      filter:
                        hoveredCollector && hoveredCollector !== item.name
                          ? "brightness(0.3) saturate(0.7)"
                          : "none",
                      opacity: hoveredCollector && hoveredCollector !== item.name ? 0.72 : 1,
                      transition: "filter 150ms ease, opacity 150ms ease",
                    }}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatAmount(value)} />
              <Legend verticalAlign="bottom" height={44} iconSize={10} wrapperStyle={{ fontSize: "15px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="flex h-96 items-center justify-center text-sm text-slate-500">No values to chart</p>
      )}
    </div>
  );
}

export function MasterlistShareChart({ lists, open, onToggle }) {
  const [hoveredMasterlist, setHoveredMasterlist] = useState("");
  const totalBlocks = 310;
  const totalClients = lists.reduce((sum, list) => sum + list.count, 0);
  const data = lists
    .filter((list) => list.count > 0)
    .map((list) => ({
      name: list.masterlistName,
      value: list.count,
      percentage: totalClients ? (list.count / totalClients) * 100 : 0,
      color: list.themeColor || COLORS[lists.indexOf(list) % COLORS.length],
    }));
  const roundedShares = data.map((item, index) => ({
    ...item,
    blocks:
      index === data.length - 1
        ? totalBlocks - data.slice(0, -1).reduce((sum, entry) => sum + Math.round((entry.percentage / 100) * totalBlocks), 0)
        : Math.round((item.percentage / 100) * totalBlocks),
  }));
  const blocks = roundedShares.flatMap((item) =>
    Array.from({ length: Math.max(0, item.blocks) }, () => item),
  );

  return (
    <section className="mb-10 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600">
      <button type="button" onClick={onToggle} className="text-left">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Masterlist client share</h2>
        <p className="mt-1 text-sm text-slate-500">{open ? "Hide chart details" : "Show chart details"}</p>
      </button>
      {open && (data.length > 0 ? (
        <div className="mt-5">
          <div
            className="grid w-full grid-cols-[repeat(31,minmax(0,1fr))] grid-rows-10 gap-1 sm:gap-1.5"
            aria-label="Masterlist client share chart"
            onMouseLeave={() => setHoveredMasterlist("")}
          >
            {blocks.map((item, index) => (
              <span
                key={`${item.name}-${index}`}
                title={`${item.name}: ${item.percentage.toFixed(1)}%`}
                aria-label={`${item.name}: 1 percent block`}
                className="aspect-square rounded-sm transition-[filter,opacity] duration-150"
                onMouseEnter={() => setHoveredMasterlist(item.name)}
                style={{
                  backgroundColor: item.color,
                  filter:
                    hoveredMasterlist && hoveredMasterlist !== item.name
                      ? "brightness(0.3) saturate(0.7)"
                      : "none",
                  opacity: hoveredMasterlist && hoveredMasterlist !== item.name ? 0.72 : 1,
                }}
              />
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-700 dark:text-slate-200">
            {roundedShares.map((item, index) => (
              <span
                key={item.name}
                className="flex items-center gap-2 transition-[filter,opacity] duration-150"
                onMouseEnter={() => setHoveredMasterlist(item.name)}
                onMouseLeave={() => setHoveredMasterlist("")}
                style={{
                  filter:
                    hoveredMasterlist && hoveredMasterlist !== item.name
                      ? "brightness(0.3) saturate(0.7)"
                      : "none",
                  opacity: hoveredMasterlist && hoveredMasterlist !== item.name ? 0.72 : 1,
                }}
              >
                <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: item.color }} />
                {item.name} {item.percentage.toFixed(1)}%
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">No masterlist data to chart</p>
      ))}
    </section>
  );
}

export default function CollectorCharts({ collectors }) {
  return (
    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <MetricChart title="Current balance by collector" collectors={collectors} field="balance" />
      <MetricChart title="Paid by collector" collectors={collectors} field="paid" />
      <MetricChart title="PTP by collector" collectors={collectors} field="ptp" />
    </div>
  );
}
