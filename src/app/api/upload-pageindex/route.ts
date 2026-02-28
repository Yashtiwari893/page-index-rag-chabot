import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { uploadDocument, waitUntilReady } from "@/lib/pageindexClient";

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        const form = await req.formData();
        const file = form.get("file") as File | null;
        const phoneNumber = form.get("phone_number") as string | null;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }
        if (!phoneNumber) {
            return NextResponse.json({ error: "phone_number is required" }, { status: 400 });
        }

        const buffer = await file.arrayBuffer();
        const filename = file.name;

        // 1) upload to PageIndex
        const docId = await uploadDocument(Buffer.from(buffer), filename);

        // 2) wait until it's ready for retrieval
        await waitUntilReady(docId);

        // 3) record in rag_files
        const { data: fileRow, error: fileError } = await supabase
            .from("rag_files")
            .insert({ name: filename, doc_id: docId })
            .select()
            .single();

        if (fileError) throw fileError;

        // 4) map doc_id to phone number (array column)
        const { data: existing, error: mapError } = await supabase
            .from("phone_document_mapping")
            .select("doc_ids")
            .eq("phone_number", phoneNumber)
            .single();

        if (mapError && mapError.code !== "PGRST116") {
            // 116 = no rows found; ignore
            throw mapError;
        }

        if (existing && Array.isArray(existing.doc_ids)) {
            const updated = Array.from(new Set([...existing.doc_ids, docId]));
            await supabase
                .from("phone_document_mapping")
                .update({ doc_ids: updated })
                .eq("phone_number", phoneNumber);
        } else {
            await supabase
                .from("phone_document_mapping")
                .insert({ phone_number: phoneNumber, doc_ids: [docId] });
        }

        return NextResponse.json({
            success: true,
            file: fileRow,
            doc_id: docId,
        });
    } catch (err: unknown) {
        console.error("UPLOAD_PAGEINDEX_ERROR:", err);
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
