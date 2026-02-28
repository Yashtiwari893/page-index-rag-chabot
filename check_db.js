const { createClient } = require("@supabase/supabase-js");
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase env variables in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
    console.log("Checking rag_files...");
    const { data: d1, error: e1 } = await supabase.from("rag_files").select("count");
    if (e1) console.error("rag_files error:", e1);
    else console.log("rag_files count:", d1);

    console.log("Checking phone_documents...");
    const { data: d2, error: e2 } = await supabase.from("phone_documents").select("count");
    if (e2) console.error("phone_documents error:", e2);
    else console.log("phone_documents count:", d2);
    
    console.log("Checking phone_document_mapping...");
    const { data: d3, error: e3 } = await supabase.from("phone_document_mapping").select("count");
    if (e3) console.error("phone_document_mapping error:", e3);
    else console.log("phone_document_mapping count:", d3);
}

check();
