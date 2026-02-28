import { NextResponse } from "next/server";
import { uploadDocument, waitUntilReady } from "@/lib/pageindexClient";
import { supabase } from "@/lib/supabaseClient";

export const runtime = "nodejs";

export async function POST(req: Request) {
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

        console.log(`Uploading ${fileName} to PageIndex for ${phoneNumber}...`);

        // 1) Upload to PageIndex
        const docId = await uploadDocument(Buffer.from(buffer), fileName);
        console.log(`File uploaded to PageIndex. doc_id: ${docId}`);

        // 2) Wait until retrieval is ready (polling)
        console.log("Waiting for PageIndex to process the document...");
        await waitUntilReady(docId);
        console.log("PageIndex processing complete.");

        // 3) Store in the new phone_documents table
        const { error: dbError } = await supabase
            .from("phone_documents")
            .insert({
                phone_number: phoneNumber,
                doc_id: docId,
                filename: fileName,
            });

        if (dbError) {
            console.error("Supabase phone_documents error:", dbError);
            throw dbError;
        }

        // 4) Update or create metadata in phone_document_mapping (for system_prompt and intent)
        // This ensures the dashboard and credentials still work
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

        return NextResponse.json({
            message: "File processed and indexed by PageIndex successfully",
            doc_id: docId,
            filename: fileName,
            phone_number: phoneNumber,
        });

    } catch (err: unknown) {
        console.error("PROCESS_FILE_ERROR:", err);
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
