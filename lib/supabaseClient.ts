// lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

// These env vars must be set in Vercel → Settings → Environment Variables
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anon);
