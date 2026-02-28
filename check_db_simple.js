const { createClient } = require("@supabase/supabase-js");

// Values from .env.local
const supabaseUrl = "https://vldarvwhvvfppthcdhhb.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsZGFydndodnZmcHB0aGNkaGhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMDY3MDYsImV4cCI6MjA4Nzc4MjcwNn0.xMtz2sRELY15pHMKf-VBsFB7G9nqsU0VVhJVuTcRNT4";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
    console.log("Checking rag_files...");
    const { data: d1, error: e1 } = await supabase.from("rag_files").select("*").limit(1);
    if (e1) console.error("rag_files error:", e1.message);
    else console.log("rag_files works, sample:", d1);

    console.log("Checking phone_documents...");
    const { data: d2, error: e2 } = await supabase.from("phone_documents").select("*").limit(1);
    if (e2) console.error("phone_documents error:", e2.message);
    else console.log("phone_documents works, sample:", d2);
    
    console.log("Checking phone_document_mapping...");
    const { data: d3, error: e3 } = await supabase.from("phone_document_mapping").select("*").limit(1);
    if (e3) console.error("phone_document_mapping error:", e3.message);
    else console.log("phone_document_mapping works, sample:", d3);
}

check();
