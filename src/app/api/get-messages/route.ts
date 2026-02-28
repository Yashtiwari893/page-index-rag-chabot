import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const session_id = searchParams.get("session_id");

    const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at", { ascending: true });

    if (error) {
        console.error("GET_MESSAGES_ERROR:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formatted = data.map((item) => ({
        role: item.role,
        content: item.content,
    }));

    return NextResponse.json({ messages: formatted });
}
