import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { chatWithDocs, type PageIndexMessage } from "@/lib/pageindexClient";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { session_id, message, file_id } = body;

        if (!session_id || !message) {
            return NextResponse.json({ error: "session_id and message are required" }, { status: 400 });
        }

        if (!file_id) {
            return NextResponse.json({ error: "file_id (PageIndex doc_id) is required" }, { status: 400 });
        }

        // Load conversation history
        const { data: historyRows, error: historyError } = await supabase
            .from("messages")
            .select("role, content")
            .eq("session_id", session_id)
            .order("created_at", { ascending: true });

        if (historyError) {
            console.error("Error loading history:", historyError);
            return NextResponse.json({ error: "Failed to load conversation history" }, { status: 500 });
        }

        const history: PageIndexMessage[] = (historyRows || []).map((m: any) => ({
            role: (m.role === "assistant" || m.role === "system") ? m.role : "user",
            content: m.content,
        }));

        const messages: PageIndexMessage[] = [
            ...history,
            { role: "user", content: message },
        ];

        // Call PageIndex with streaming enabled
        const upstream = await chatWithDocs(file_id, messages, { stream: true });

        if (upstream instanceof Response) {
            const contentType = upstream.headers.get("content-type") || "text/plain; charset=utf-8";
            return new Response(upstream.body, {
                headers: {
                    "Content-Type": contentType,
                    "Cache-Control": "no-store",
                },
            });
        }

        // Fallback: non-streaming string result
        if (typeof upstream === "string") {
            return NextResponse.json({ reply: upstream });
        }

        return NextResponse.json({ error: "Unexpected response from PageIndex" }, { status: 500 });
    } catch (err: unknown) {
        console.error("CHAT_ERROR:", err);
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
