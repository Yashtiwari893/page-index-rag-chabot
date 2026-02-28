import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

// we call PageIndex directly; constants kept in lib for reuse
const PAGEINDEX_BASE_URL = "https://api.pageindex.ai";
const PAGEINDEX_API_KEY = process.env.PAGEINDEX_API_KEY || "";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { session_id, message, doc_id } = body;

        if (!session_id || !message || !doc_id) {
            return NextResponse.json(
                { error: "session_id, message and doc_id are required" },
                { status: 400 }
            );
        }

        const docs = Array.isArray(doc_id) ? doc_id : [doc_id];
        if (docs.length === 0) {
            return NextResponse.json({ error: "No doc_id provided" }, { status: 400 });
        }

        // 1. load conversation history (for context playback)
        const { data: historyRows } = await supabase
            .from("messages")
            .select("role, content")
            .eq("session_id", session_id)
            .order("created_at", { ascending: true });

        const history = (historyRows || []).map((m: any) => ({
            role: m.role,
            content: m.content,
        }));

        // 2. Build messages list for PageIndex chat
        const messages = [
            ...history,
            { role: "user", content: message }
        ];

        // 3. Send request to PageIndex with streaming
        const payload = {
            doc_id: docs.length === 1 ? docs[0] : docs,
            messages,
            stream: true,
            enable_citations: true,
        };

        const resp = await fetch(`${PAGEINDEX_BASE_URL}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api_key": PAGEINDEX_API_KEY,
            },
            body: JSON.stringify(payload),
        });

        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`PageIndex chat failed: ${errText}`);
        }

        const reader = resp.body?.getReader();
        const decoder = new TextDecoder();
        let fullReply = "";

        // create streaming response back to client
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    if (reader) {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            const chunk = decoder.decode(value, { stream: true });
                            fullReply += chunk;
                            controller.enqueue(encoder.encode(chunk));
                        }
                    }
                    controller.close();
                } catch (err) {
                    controller.error(err);
                }
            },
            cancel() {
                reader?.cancel();
            }
        });

        // after streaming has been initiated, save user + ai messages
        // we save AI message when the stream completes by hooking into stream's
        // closed promise below (caller not available); instead we can enqueue a
        // small task
        (async () => {
            try {
                await supabase.from("messages").insert([
                    { session_id, role: "user", content: message },
                ]);
                await supabase.from("messages").insert([
                    { session_id, role: "assistant", content: fullReply },
                ]);
            } catch (e) {
                console.error("CHAT_SAVE_ERROR", e);
            }
        })();

        return new Response(stream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Transfer-Encoding": "chunked",
            },
        });
    } catch (err: unknown) {
        console.error("CHAT_ERROR:", err);
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
