
"use client";

import { useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { supabase } from "../lib/supabaseClient";

type MaterialItem = {
  id: string;
  name: string;
  quantity: string;
  neededBy: string; // date
  notes: string;
};

type CategoryProgress = Record<string, number>;

type Entry = {
  id: string;
  date: string; // ISO
  site: string;
  area: string;
  categoryProgress: CategoryProgress;
  weather: string;
  obstacles: string;
  notes: string;
  manpower: string;
  safetyIncidents: string;
  materialsRequired: boolean;
  materialItems: MaterialItem[];
  photos: string[]; // data URLs
};

const DEFAULT_CATEGORIES = [
  "Demolition",
  "Electrical",
  "Plumbing",
  "Masonry / Blockwork",
  "Plaster / Skim",
  "Ceiling",
  "Painting",
  "Flooring / Tiling",
  "Doors & Windows",
  "Built-in Furniture",
  "MEP Testing / Commissioning",
  "Cleaning / Hand-over",
];

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export default function Page() {
  const [entries, setEntries] = useState<Entry[]>(() => {
    try {
      const raw = localStorage.getItem("pmag_daily_entries");
      return raw ? (JSON.parse(raw) as Entry[]) : [];
    } catch {
      return [];
    }
  });

  const [form, setForm] = useState<Entry>({
    id: uid("entry"),
    date: new Date().toISOString(),
    site: "",
    area: "",
    categoryProgress: Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c, 0])) as CategoryProgress,
    weather: "",
    obstacles: "",
    notes: "",
    manpower: "",
    safetyIncidents: "None",
    materialsRequired: false,
    materialItems: [],
    photos: [],
  });

  const reportRef = useRef<HTMLDivElement>(null);

  // Photos
  const onPhotoUpload = async (files: FileList | null) => {
    if (!files) return;
    const toData = (f: File) =>
      new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(f);
      });
    const added: string[] = [];
    for (const f of Array.from(files)) {
      const data = await toData(f);
      added.push(data);
    }
    setForm((s) => ({ ...s, photos: [...s.photos, ...added] }));
  };

  const removePhoto = (idx: number) => {
    setForm((s) => ({ ...s, photos: s.photos.filter((_, i) => i !== idx) }));
  };

  // Materials
  const addMaterialItem = () => {
    setForm((s) => ({
      ...s,
      materialItems: [
        ...s.materialItems,
        { id: uid("mat"), name: "", quantity: "", neededBy: "", notes: "" },
      ],
    }));
  };

  const updateMaterialItem = (id: string, patch: Partial<MaterialItem>) => {
    setForm((s) => ({
      ...s,
      materialItems: s.materialItems.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  };

  const removeMaterialItem = (id: string) => {
    setForm((s) => ({
      ...s,
      materialItems: s.materialItems.filter((m) => m.id !== id),
    }));
  };

  // Save/Delete
  const resetForm = () => {
    setForm({
      id: uid("entry"),
      date: new Date().toISOString(),
      site: "",
      area: "",
      categoryProgress: Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c, 0])) as CategoryProgress,
      weather: "",
      obstacles: "",
      notes: "",
      manpower: "",
      safetyIncidents: "None",
      materialsRequired: false,
      materialItems: [],
      photos: [],
    });
  };

  const saveEntry = () => {
    const cleaned: Entry = {
      ...form,
      site: form.site.trim(),
      area: form.area.trim(),
    };
    const next = [cleaned, ...entries];
    setEntries(next);
    localStorage.setItem("pmag_daily_entries", JSON.stringify(next));
    resetForm();
  };

  const deleteEntry = (id: string) => {
    const next = entries.filter((e) => e.id !== id);
    setEntries(next);
    localStorage.setItem("pmag_daily_entries", JSON.stringify(next));
  };

  // Export JSON
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    a.download = `daily-report-${yyyy}-${mm}-${dd}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // PDF helpers
  const generatePDF = async (entry?: Entry) => {
    const node = reportRef.current;
    if (!node) return;

    const original = node.innerHTML;
    if (entry) node.innerHTML = renderReportHTML(entry);
    else node.innerHTML = renderAllReportsHTML(entries);

    const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let y = 0;
    let remaining = imgHeight;

    while (remaining > 0) {
      pdf.addImage(imgData, "PNG", 0, y ? 0 : 0, imgWidth, imgHeight);
      remaining -= pageHeight;
      if (remaining > 0) pdf.addPage();
      y += pageHeight;
    }

    const d = new Date(entry ? entry.date : Date.now());
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");

    const filename = entry
      ? `Daily-Report_${yyyy}-${mm}-${dd}_${entry.site || "site"}.pdf`
      : `Daily-Reports_${yyyy}-${mm}-${dd}.pdf`;

    pdf.save(filename);
    node.innerHTML = original;
  };

  // Weather (geolocation + Open-Meteo)
  const fillWeatherFromLocation = async () => {
    try {
      const coords = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 300000,
        });
      });
      const { latitude, longitude } = coords.coords;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m`;
      const res = await fetch(url);
      const data = await res.json();
      const c = data?.current || {};
      const weatherText = `${decodeWeatherCode(c.weather_code)} ${fmt(c.temperature_2m, "°C")} | Wind ${fmt(c.wind_speed_10m, "km/h")} | RH ${fmt(c.relative_humidity_2m, "%")} | Rain ${fmt(c.precipitation, "mm")}`.trim();
      setForm((s) => ({ ...s, weather: weatherText }));
    } catch (err: any) {
      setForm((s) => ({ ...s, weather: s.weather || `Weather lookup failed: ${err?.message || String(err)}` }));
    }
  };

  function fmt(v: any, unit: string) {
    return typeof v === "number" && !isNaN(v) ? `${v}${unit}` : "";
  }
  function decodeWeatherCode(code: number): string {
    const map: Record<number, string> = {
      0: "Clear",
      1: "Mainly clear",
      2: "Partly cloudy",
      3: "Overcast",
      45: "Fog",
      48: "Rime fog",
      51: "Drizzle light",
      53: "Drizzle",
      55: "Drizzle heavy",
      61: "Rain light",
      63: "Rain",
      65: "Rain heavy",
      71: "Snow light",
      73: "Snow",
      75: "Snow heavy",
      80: "Rain showers light",
      81: "Rain showers",
      82: "Rain showers heavy",
      95: "Thunderstorm",
      96: "Thunderstorm hail",
      99: "Thunderstorm heavy hail",
    };
    return map[code] || "Weather";
  }

  // Render helpers (HTML for PDF)
  const renderReportHTML = (e: Entry) => {
    const d = new Date(e.date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");

    const catRows = Object.entries(e.categoryProgress)
      .map(([k, v]) => `
        <tr>
          <td style='border:1px solid #999; padding:6px;'>${escapeHTML(k)}</td>
          <td style='border:1px solid #999; padding:6px;'>${v}%</td>
        </tr>`)
      .join("");

    const matTable = e.materialsRequired && e.materialItems.length
      ? `<table style='width:100%; border-collapse:collapse; font-size:12px;'>
           <tr>
             <th style='border:1px solid #999; padding:6px; text-align:left;'>Item</th>
             <th style='border:1px solid #999; padding:6px; text-align:left;'>Qty</th>
             <th style='border:1px solid #999; padding:6px; text-align:left;'>Needed By</th>
             <th style='border:1px solid #999; padding:6px; text-align:left;'>Notes</th>
           </tr>
           ${e.materialItems.map((m) => `
             <tr>
               <td style='border:1px solid #999; padding:6px;'>${escapeHTML(m.name)}</td>
               <td style='border:1px solid #999; padding:6px;'>${escapeHTML(m.quantity)}</td>
               <td style='border:1px solid #999; padding:6px;'>${m.neededBy || ""}</td>
               <td style='border:1px solid #999; padding:6px;'>${escapeHTML(m.notes)}</td>
             </tr>`).join("")}
         </table>`
      : `<div style='font-size:12px;'>No</div>`;

    const photos = e.photos.length
      ? `<div style="margin-top:12px;">
           <h3 style='font-size:14px; margin:0 0 6px;'>Photos</h3>
           <div style='display:flex; flex-wrap:wrap; gap:8px;'>
             ${e.photos.map((p) => `<img src='${p}' style='width:180px; height:120px; object-fit:cover; border:1px solid #ccc; border-radius:8px;'/>`).join("")}
           </div>
         </div>` : "";

    return `
      <div style="font-family: ui-sans-serif, system-ui; padding: 24px; width: 794px;">
        <h1 style="font-size: 20px; margin: 0 0 8px;">Renovation Daily Report</h1>
        <div style="font-size:12px; color:#444; margin-bottom:12px;">Date: ${yyyy}-${mm}-${dd}</div>
        <table style="width:100%; border-collapse: collapse; font-size: 12px; margin-bottom: 12px;">
          <tr>
            <td style="border:1px solid #999; padding:6px; width:50%"><strong>Site / Project</strong><br/>${escapeHTML(e.site)}</td>
            <td style="border:1px solid #999; padding:6px; width:50%"><strong>Area / Zone</strong><br/>${escapeHTML(e.area)}</td>
          </tr>
          <tr>
            <td style="border:1px solid #999; padding:6px"><strong>Weather</strong><br/>${escapeHTML(e.weather)}</td>
            <td style="border:1px solid #999; padding:6px"><strong>Manpower</strong><br/>${escapeHTML(e.manpower)}</td>
          </tr>
          <tr>
            <td style="border:1px solid #999; padding:6px"><strong>Obstacles</strong><br/>${escapeHTML(e.obstacles) || "-"}</td>
            <td style="border:1px solid #999; padding:6px"><strong>Safety Incidents</strong><br/>${escapeHTML(e.safetyIncidents) || "None"}</td>
          </tr>
          <tr>
            <td colspan="2" style="border:1px solid #999; padding:6px"><strong>Notes</strong><br/>${escapeHTML(e.notes) || "-"}</td>
          </tr>
        </table>

        <div style="margin-top:8px;">
          <h3 style="font-size:14px; margin:0 0 6px;">Category Progress</h3>
          <table style='width:100%; border-collapse:collapse; font-size:12px;'>
            <tr>
              <th style='border:1px solid #999; padding:6px; text-align:left;'>Category</th>
              <th style='border:1px solid #999; padding:6px; text-align:left;'>Progress</th>
            </tr>
            ${catRows}
          </table>
        </div>

        <div style="margin-top:8px;">
          <h3 style="font-size:14px; margin:0 0 6px;">Materials Required</h3>
          ${matTable}
        </div>

        ${photos}
      </div>
    `;
  };

  const renderAllReportsHTML = (all: Entry[]) => {
    return all.map(renderReportHTML).join("<div style='page-break-after:always'></div>");
  };

  const todaysEntries = useMemo(() => {
    return entries.filter((e) => {
      const d = new Date(e.date);
      const t = new Date();
      return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
    });
  }, [entries]);

  // UI
  return (
    <div className="container">
      <h1>Renovation Daily Report – Foreman App</h1>
      <p className="muted">Per-category progress, photos, auto-weather, obstacles, manpower, safety, and materials. Offline-first; export PDF/JSON.</p>

      <div className="card">
        <div className="card-header">
          <strong>New Entry</strong>
        </div>
        <div className="card-body grid cols-1">
          <div className="grid cols-4">
            <div>
              <label>Date</label>
              <input
                type="date"
                value={new Date(form.date).toISOString().slice(0,10)}
                onChange={(e) => setForm((s) => ({ ...s, date: new Date(e.target.value).toISOString() }))}
              />
            </div>
            <div>
              <label>Site / Project</label>
              <input
                type="text"
                placeholder="e.g., Prime 11 Unit 213"
                value={form.site}
                onChange={(e) => setForm((s) => ({ ...s, site: e.target.value }))}
              />
            </div>
            <div>
              <label>Area / Zone</label>
              <input
                type="text"
                placeholder="e.g., Living Room, Level 30"
                value={form.area}
                onChange={(e) => setForm((s) => ({ ...s, area: e.target.value }))}
              />
            </div>
            <div>
              <label>Weather</label>
              <div className="row">
                <input
                  type="text"
                  placeholder="Tap locator to auto-fill"
                  value={form.weather}
                  onChange={(e) => setForm((s) => ({ ...s, weather: e.target.value }))}
                />
                <button className="btn" type="button" onClick={fillWeatherFromLocation} title="Auto-fill from location">📍</button>
              </div>
            </div>
          </div>

          {/* Category progress */}
          <div className="card" style={{border:'1px dashed var(--border)', marginTop:8}}>
            <div className="card-body">
              <div className="row" style={{justifyContent:'space-between'}}>
                <strong>Category Progress (0–100%)</strong>
                <AddCategory onAdd={(name) => {
                  if (!name) return;
                  setForm((s) => ({
                    ...s,
                    categoryProgress: s.categoryProgress[name] !== undefined
                      ? s.categoryProgress
                      : { ...s.categoryProgress, [name]: 0 },
                  }));
                }} />
              </div>
              <div className="grid cols-2" style={{marginTop:12}}>
                {Object.entries(form.categoryProgress).map(([cat, prog]) => (
                  <div key={cat} className="card" style={{padding:12}}>
                    <div className="row" style={{justifyContent:'space-between'}}>
                      <div style={{fontWeight:600, paddingRight:8, overflow:'hidden', textOverflow:'ellipsis'}} title={cat}>{cat}</div>
                      <div className="small">{prog}%</div>
                    </div>
                    <input
                      className="range"
                      type="range"
                      min={0}
                      max={100}
                      value={prog}
                      onChange={(e) => setForm((s) => ({ ...s, categoryProgress: { ...s.categoryProgress, [cat]: Number(e.target.value) } }))}
                    />
                    {!DEFAULT_CATEGORIES.includes(cat) && (
                      <div style={{textAlign:'right'}}>
                        <button className="btn" type="button" onClick={() => {
                          setForm((s) => {
                            const cp = { ...s.categoryProgress };
                            delete cp[cat];
                            return { ...s, categoryProgress: cp };
                          });
                        }}>Remove</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid cols-2">
            <div>
              <label>Obstacles / Issues</label>
              <textarea
                placeholder="e.g., Awaiting materials delivery; access limited 10:00–12:00"
                value={form.obstacles}
                onChange={(e) => setForm((s) => ({ ...s, obstacles: e.target.value }))}
              />
            </div>
            <div>
              <label>Notes / Scope Completed</label>
              <textarea
                placeholder="Describe work completed, pending tasks, coordination notes"
                value={form.notes}
                onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid cols-2">
            <div>
              <label>Manpower on Site</label>
              <input
                type="text"
                placeholder="e.g., 6 workers (2 elec, 2 tile, 2 paint)"
                value={form.manpower}
                onChange={(e) => setForm((s) => ({ ...s, manpower: e.target.value }))}
              />
            </div>
            <div>
              <label>Safety Incidents</label>
              <input
                type="text"
                placeholder="None"
                value={form.safetyIncidents}
                onChange={(e) => setForm((s) => ({ ...s, safetyIncidents: e.target.value }))}
              />
            </div>
          </div>

          <div className="row" style={{marginTop:8}}>
            <label style={{margin:0}}>
              <input
                type="checkbox"
                checked={form.materialsRequired}
                onChange={(e) => setForm((s) => ({ ...s, materialsRequired: e.target.checked }))}
              />{" "}
              Materials Required to Purchase?
            </label>
          </div>

          {form.materialsRequired && (
            <div className="card" style={{padding:12, marginTop:8}}>
              <div className="row" style={{justifyContent:'space-between'}}>
                <strong>Material Request</strong>
                <button className="btn" type="button" onClick={addMaterialItem}>+ Add Item</button>
              </div>
              <div className="grid cols-1" style={{marginTop:8}}>
                {form.materialItems.length === 0 && (
                  <div className="small">Add items needed for the next work steps.</div>
                )}
                {form.materialItems.map((m) => (
                  <div key={m.id} className="grid cols-4">
                    <div>
                      <label>Item</label>
                      <input
                        type="text"
                        value={m.name}
                        onChange={(e) => updateMaterialItem(m.id, { name: e.target.value })}
                        placeholder="e.g., 12mm gypsum board"
                      />
                    </div>
                    <div>
                      <label>Qty</label>
                      <input
                        type="text"
                        value={m.quantity}
                        onChange={(e) => updateMaterialItem(m.id, { quantity: e.target.value })}
                        placeholder="e.g., 30 pcs"
                      />
                    </div>
                    <div>
                      <label>Needed By</label>
                      <input
                        type="date"
                        value={m.neededBy}
                        onChange={(e) => updateMaterialItem(m.id, { neededBy: e.target.value })}
                      />
                    </div>
                    <div>
                      <label>Notes</label>
                      <input
                        type="text"
                        value={m.notes}
                        onChange={(e) => updateMaterialItem(m.id, { notes: e.target.value })}
                        placeholder="e.g., brand/spec"
                      />
                    </div>
                    <div style={{gridColumn:'1/-1', textAlign:'right'}}>
                      <button className="btn" type="button" onClick={() => removeMaterialItem(m.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Photos */}
          <div className="card" style={{padding:12, marginTop:8}}>
            <div className="row" style={{justifyContent:'space-between'}}>
              <strong>Photos</strong>
              <label className="btn">
                Upload
                <input className="hidden" type="file" accept="image/*" multiple onChange={(e) => onPhotoUpload(e.target.files)} />
              </label>
            </div>
            {form.photos.length === 0 ? (
              <div className="small" style={{marginTop:8}}>Add progress photos (they will appear in the PDF).</div>
            ) : (
              <div className="grid cols-4" style={{marginTop:8}}>
                {form.photos.map((p, idx) => (
                  <div key={idx}>
                    <img src={p} className="photo" />
                    <div style={{textAlign:'right'}}>
                      <button className="btn" type="button" onClick={() => removePhoto(idx)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="card-footer">
          <div className="row">
            <button className="btn primary" onClick={saveEntry}>+ Add to Daily List</button>
            <button className="btn" onClick={resetForm}>Clear Form</button>
          </div>
          <div className="row">
            <button className="btn" onClick={() => generatePDF()}>Export All as PDF</button>
            <button className="btn" onClick={exportJSON}>Export JSON</button>
          </div>
        </div>
      </div>

      <div className="card" style={{marginTop:12}}>
        <div className="card-body">
          <strong>Today</strong>
          <div className="small">{todaysEntries.length} entr{todaysEntries.length === 1 ? "y" : "ies"} saved for {new Date().toISOString().slice(0,10)}.</div>
        </div>
      </div>

      <div className="grid cols-1" style={{marginTop:12}}>
        {entries.length === 0 && (
          <div className="card"><div className="card-body small">No entries yet. Add your first entry above.</div></div>
        )}
        {entries.map((e) => (
          <div key={e.id} className="card">
            <div className="card-body">
              <div className="row" style={{justifyContent:'space-between'}}>
                <div><strong>{e.site || "(No site)"}</strong></div>
                <div className="row" style={{gap:6}}>
                  <span className="badge">{new Date(e.date).toISOString().slice(0,10)}</span>
                  <span className="badge">{summarizeProgress(e.categoryProgress)}</span>
                </div>
              </div>
              <div className="small">Area: {e.area || "-"}</div>
              <div className="grid cols-3" style={{marginTop:8}}>
                <div className="small"><strong>Weather:</strong> {e.weather || "-"}</div>
                <div className="small"><strong>Manpower:</strong> {e.manpower || "-"}</div>
                <div className="small"><strong>Safety:</strong> {e.safetyIncidents || "None"}</div>
              </div>
              <div className="small" style={{marginTop:6}}><strong>Obstacles:</strong> {e.obstacles || "-"}</div>
              <div className="small" style={{marginTop:6}}><strong>Notes:</strong> {e.notes || "-"}</div>

              <div style={{marginTop:8}}>
                <div className="small"><strong>Materials Required:</strong> {e.materialsRequired ? "Yes" : "No"}</div>
                {e.materialsRequired && e.materialItems.length > 0 && (
                  <div style={{overflowX:'auto', marginTop:6}}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Qty</th>
                          <th>Needed By</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.materialItems.map((m) => (
                          <tr key={m.id}>
                            <td>{m.name}</td>
                            <td>{m.quantity}</td>
                            <td>{m.neededBy}</td>
                            <td>{m.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {e.photos.length > 0 && (
                <div style={{marginTop:8}}>
                  <div className="grid cols-4">
                    {e.photos.slice(0, 8).map((p, idx) => (
                      <img key={idx} src={p} className="photo" />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="card-footer">
              <div className="small">Entry ID: {e.id}</div>
              <div className="row">
                <button className="btn" onClick={() => generatePDF(e)}>PDF</button>
                <button className="btn" onClick={() => deleteEntry(e.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Hidden render target for PDF */}
      <div ref={reportRef} className="hidden" />

      <div className="footer">PM:AG Design & Construction • Offline‑friendly daily reporting tool.</div>
    </div>
  );
}

function AddCategory({ onAdd }: { onAdd: (name: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="row">
      <input
        type="text"
        placeholder="Add custom category"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        style={{height:36}}
      />
      <button className="btn" type="button" onClick={() => {
        const name = val.trim();
        if (name) { onAdd(name); setVal(""); }
      }}>Add</button>
    </div>
  );
}

function summarizeProgress(cp: Record<string, number>) {
  const top = Object.entries(cp)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k.split(" ")[0]} ${v}%`)
    .join(", ");
  return top || "No progress";
}

function escapeHTML(str: string) {
  return (str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c] as string));
}
