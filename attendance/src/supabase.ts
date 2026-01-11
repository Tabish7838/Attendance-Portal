import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://bqldpyfjeldklyzcpxnf.supabase.co";
const supabaseAnonKey = "sb_publishable_jVhA08rITbTEsIZT1eeOJA_aS-UjYC0";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
