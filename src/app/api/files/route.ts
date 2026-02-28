import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export const runtime = "nodejs";

type FileRow = {
    id: string;
    name: string;
    created_at: string;
    rag_chunks?: { count: number }[];
};

export async function GET() {
    const { data, error } = await supabase
        .from("rag_files")
        .select("id, name, doc_id, created_at")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("FILES_API_ERROR:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const files = (data as any[] | null)?.map((file) => ({
        id: file.id,
        doc_id: file.doc_id,
        name: file.name,
        created_at: file.created_at,
        chunk_count: 0, // not used on chat page
    })) ?? [];

    return NextResponse.json({ files });
}

export async function DELETE(req: Request) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { error } = await supabase.from("rag_files").delete().eq("id", id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
