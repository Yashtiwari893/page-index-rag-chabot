const { createClient } = require("@supabase/supabase-js");
const supabaseUrl = "https://vldarvwhvvfppthcdhhb.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsZGFydndodnZmcHB0aGNkaGhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMDY3MDYsImV4cCI6MjA4Nzc4MjcwNn0.xMtz2sRELY15pHMKf-VBsFB7G9nqsU0VVhJVuTcRNT4";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
    console.log("Checking messages...");
    const { data, error } = await supabase.from("messages").select("count");
    if (error) console.error("messages error:", error.message);
    else console.log("messages count:", data);
}
check();
