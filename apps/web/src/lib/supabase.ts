import {
  createClient,
} from "@supabase/supabase-js";

import {
  auditedSupabaseFetch,
} from "./auditedSupabaseFetch";

const supabaseUrl =
  import.meta.env
    .VITE_SUPABASE_URL?.trim();

const supabasePublishableKey =
  import.meta.env
    .VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const supabaseConfigurationError =
  !supabaseUrl ||
  !supabasePublishableKey
    ? "As variáveis do Supabase ainda não foram configuradas."
    : null;

export const supabase = createClient(
  supabaseUrl ??
    "https://configuracao-invalida.supabase.co",
  supabasePublishableKey ??
    "chave-invalida",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      fetch:
        auditedSupabaseFetch,
    },
  },
);