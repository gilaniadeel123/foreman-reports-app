"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { supabase } from "../lib/supabaseClient";

/* ----------------------------- Types ----------------------------- */

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
  photos: string[]; // urls (after upload) or data URLs before upload
};

/* ------------------------- Constants/Helpers ------------------------- */

const FIXED_PROJECT = "Prime 11 Unit 213";

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

function dataURLToBlob(dataURL: string) {
  const [meta, b64] = dataURL.split(",");
  const mime = /data:(.*?);/.exec(meta)?.[1] || "image/jpeg";
  const bin = atob(b64);
  const len = bin.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/* =============================== Page =============================== */

export default function Page() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [form, setForm] = useState<Entry>({
    id: uid("entry"),
    date: new Date().toISOString(),
    site: FIXED_PROJECT, // fixed project
    area: "",
    categoryProgress: Object.fromEntries(
      DEFAULT_CATEGORIES.map((c) => [c, 0])
    ) as CategoryProgress,
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

  /* ----------------------- Startup: load from DB ---------------------- */

  // Prefill progress from MOST RECENT entry (any date)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("category_progress, entry_date")
        .eq("site", FIXED_PROJECT)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data?.category_progress) {
        setForm((s) => ({
          ...s,
          categoryProgress: data.category_progress as Record<string, number>,
        }));
      }
    })();
  }, []);

  // Load today's entries so the list reflects what's in the cloud
  useEffect(() => {
    (async () => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const { data, error } = await supabase
        .from("entries")
        .select("*")
        .eq("site", FIXED_PROJECT)
        .eq("entry_date", `${yyyy}-${mm}-${dd}`)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setEntries(
          data.map((row: any) => ({
            id: row.id,
            date: row.entry_date,
            site: row.site,
            area: row.area || "",
            categoryProgress: row.category_progress || {},
            weather: row.weather || "",
            obstacles: row.obstacles || "",
            notes: row.notes || "",
            manpower: row.manpower || "",
            safetyIncidents: row.safety_incidents || "None",
            materialsRequired: !!row.materials_required,
            materialItems: row.material_items || [],
            photos: row.photo_urls || [],
          }))
        );
      }
    })();
  }, []);

  /* ------------------------------ Photos ----------------------------- */

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

  /* ----------------------------- Materials ---------------------------- */

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
      materialItems: s.materialItems.map((m) =>
        m.id === id ? { ...m, ...patch } : m
      ),
    }));
  };

  const removeMaterialItem = (id: string) => {
    setForm((s) => ({
      ...s,
      materialItems: s.materialItems.filter((m) => m.id !== id),
    }));
  };

  /* ---------------------------- Save / Reset --------------------------- */

  const resetForm = () => {
    setForm({
      id: uid("entry"),
      date: new Date().toISOString(),
      site: FIXED_PROJECT,
      area: "",
      categoryProgress: Object.fromEntries(
        DEFAULT_CATEGORIES.map((c) => [c, 0])
      ) as CategoryProgress,
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

  // Save to Supabase: upload photos → insert row → update UI
  const saveEntry = async () => {
    try {
      // 1) Upload photos
      const uploadedUrls: string[] = [];
      for (let i = 0; i < form.photos.length; i++) {
        const data = form.photos[i];
        const isDataUrl = data.startsWith("data:");
        const blob = isDataUrl ? dataURLToBlob(data) : null;
        const entryId = form.id;
        const path = `${entryId}/${i}.jpg`;

        if (blob) {
