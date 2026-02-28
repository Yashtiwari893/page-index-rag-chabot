import { NextResponse } from "next/server";
import { uploadDocument } from "@/lib/pageindexClient";
import { supabase } from "@/lib/supabaseClient";

export const runtime = "nodejs";

export async function POST(req: Request) {
    let docId: string | null = null;
    try {
        const form = await req.formData();
        const file = form.get("file") as File | null;
        const phoneNumber = form.get("phone_number") as string | null;
        const intent = form.get("intent") as string | null;
        const authToken = form.get("auth_token") as string | null;
        const origin = form.get("origin") as string | null;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        if (!phoneNumber) {
            return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
        }

        if (!authToken || !origin) {
            return NextResponse.json({
                error: "11za auth_token and origin are required"
            }, { status: 400 });
        }

        const buffer = await file.arrayBuffer();
        const fileName = file.name;

        console.log(`[ProcessFile] Uploading ${fileName} to PageIndex for ${phoneNumber}...`);

        // 1) Upload to PageIndex - RETURNS IMMEDIATELY
        const uploadedDocId = await uploadDocument(Buffer.from(buffer), fileName);
        docId = uploadedDocId;
        console.log(`[ProcessFile] File uploaded to PageIndex. doc_id: ${uploadedDocId}`);

        // 2) Store in the new phone_documents table - NO WAITING FOR PROCESSING
        const { error: dbError } = await supabase
            .from("phone_documents")
            .insert({
                phone_number: phoneNumber,
                doc_id: uploadedDocId,
                filename: fileName,
            });

        if (dbError) {
            console.error("[ProcessFile] Supabase phone_documents error:", dbError);
            throw dbError;
        }

        // 3) Update or create metadata in phone_document_mapping
        const { data: existingMapping } = await supabase
            .from("phone_document_mapping")
            .select("*")
            .eq("phone_number", phoneNumber)
            .limit(1);

        if (existingMapping && existingMapping.length > 0) {
            await supabase
                .from("phone_document_mapping")
                .update({
                    intent: intent || existingMapping[0].intent,
                    auth_token: authToken,
                    origin: origin,
                })
                .eq("phone_number", phoneNumber);
        } else {
            // Create a record without file_id (we use doc_id in phone_documents now)
            await supabase
                .from("phone_document_mapping")
                .insert({
                    phone_number: phoneNumber,
                    intent: intent,
                    auth_token: authToken,
                    origin: origin,
                    file_id: null
                });
        }

        console.log(`[ProcessFile] ✅ Saved to Supabase. Frontend will poll /api/upload-pageindex/status?doc_id=${uploadedDocId}`);

        // 4) RETURN IMMEDIATELY - DO NOT WAIT FOR PAGEINDEX PROCESSING
        // Frontend should poll /api/upload-pageindex/status?doc_id={docId} to check when ready
        return NextResponse.json({
            message: "File uploaded to PageIndex. Check status via polling endpoint.",
            doc_id: uploadedDocId,
            filename: fileName,
            phone_number: phoneNumber,
            status: "processing",
            status_endpoint: `/api/upload-pageindex/status?doc_id=${uploadedDocId}`,
        });

    } catch (err: unknown) {
        console.error("PROCESS_FILE_ERROR:", err);
        // Cleanup on failure
        if (docId) {
            void supabase.from("phone_documents").delete().eq("doc_id", docId);
        }
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
