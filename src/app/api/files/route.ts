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
    try {
        // 1) PageIndex documents (phone_documents table)
        const { data: piDocs, error: piError } = await supabase
            .from("phone_documents")
            .select("doc_id, filename, uploaded_at, phone_number")
            .order("uploaded_at", { ascending: false });

        if (piError) throw piError;

        const pageIndexFiles = (piDocs || []).map((d: any) => ({
            id: d.doc_id,
            name: d.filename,
            created_at: d.uploaded_at,
            file_type: "pageindex",
            phone_number: d.phone_number,
        }));

        // 2) Legacy rag_files
        const { data: legacyFiles, error: legacyError } = await supabase
            .from("rag_files")
            .select("id, name, created_at, doc_id")
            .order("created_at", { ascending: false });

        if (legacyError) throw legacyError;

        const legacy = (legacyFiles || []).map((f: any) => ({
            id: f.doc_id || f.id,
            db_id: f.id,
            name: f.name,
            created_at: f.created_at,
            file_type: f.doc_id ? "pageindex" : "legacy",
        }));

        const files = [...pageIndexFiles, ...legacy];

        return NextResponse.json({ files });
    } catch (err: unknown) {
        console.error("FILES_API_ERROR:", err);
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
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
