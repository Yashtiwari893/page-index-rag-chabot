import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { uploadDocument, checkStatus } from "@/lib/pageindexClient";

export const runtime = "nodejs";

/**
 * POST: Upload file to PageIndex and save immediately with "processing" status
 * Returns immediately without waiting for processing to complete
 * Frontend will poll GET endpoint to check when processing is done
 */
export async function POST(req: Request) {
  let docId: string | null = null;
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const phoneNumber = form.get("phone_number") as string | null;
    const authToken = form.get("auth_token") as string | null;
    const origin = form.get("origin") as string | null;
    const intent = form.get("intent") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!phoneNumber) {
      return NextResponse.json({ error: "phone_number is required" }, { status: 400 });
    }

    if (!authToken || !origin) {
      return NextResponse.json({ error: "auth_token and origin are required" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const filename = file.name;

    // 1) Upload to PageIndex - FAST, returns immediately with doc_id
    console.log(`[Upload] Uploading ${filename} to PageIndex...`);
    const uploadedDocId = await uploadDocument(Buffer.from(buffer), filename);
    docId = uploadedDocId;
    console.log(`[Upload] ✅ File uploaded to PageIndex. doc_id=${uploadedDocId}`);

    // 2) Save to Supabase with "processing" status - DO NOT WAIT FOR PAGEINDEX TO PROCESS
    const { error: insertError } = await supabase.from("phone_documents").insert({
      phone_number: phoneNumber,
      doc_id: uploadedDocId,
      filename: filename,
      uploaded_at: new Date().toISOString(),
    });

    if (insertError) throw insertError;
    console.log(`[Upload] ✅ Saved to Supabase with processing status`);

    // 3) Upsert phone_document_mapping with credentials
    const { data: existing } = await supabase
      .from("phone_document_mapping")
      .select("*")
      .eq("phone_number", phoneNumber)
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from("phone_document_mapping")
        .update({
          intent: intent || existing[0].intent,
          auth_token: authToken,
          origin: origin,
        })
        .eq("phone_number", phoneNumber);
    } else {
      await supabase.from("phone_document_mapping").insert({
        phone_number: phoneNumber,
        intent: intent,
        auth_token: authToken,
        origin: origin,
        file_id: null,
      });
    }

    // 4) Return immediately - frontend will poll for status
    return NextResponse.json({
      success: true,
      doc_id: uploadedDocId,
      filename,
      phone_number: phoneNumber,
      status: "processing",
    });
  } catch (err: unknown) {
    console.error("UPLOAD_PAGEINDEX_ERROR:", err);
    // cleanup on failure: delete inserted phone_documents entry if docId exists
    if (docId) {
      void supabase.from("phone_documents").delete().eq("doc_id", docId);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET: Check processing status of a document
 * Frontend polls this endpoint every 3 seconds to check if processing is complete
 * Query params: doc_id (required)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const docId = url.searchParams.get("doc_id");

    if (!docId) {
      return NextResponse.json(
        { error: "doc_id query parameter is required" },
        { status: 400 }
      );
    }

    // 1) Check status from PageIndex API
    const pageIndexStatus = await checkStatus(docId);

    // 2) If processing is complete, update Supabase status to "completed"
    if (pageIndexStatus.retrieval_ready) {
      console.log(`[Status] ✅ Processing complete for doc_id=${docId}`);
      
      // Update the phone_documents record status if it exists
      await supabase
        .from("phone_documents")
        .update({ processed_at: new Date().toISOString() })
        .eq("doc_id", docId);
    }

    // 3) Return status to frontend
    return NextResponse.json({
      doc_id: docId,
      status: pageIndexStatus.status,
      retrieval_ready: pageIndexStatus.retrieval_ready,
      message: pageIndexStatus.retrieval_ready
        ? "Processing complete"
        : "Still processing...",
    });
  } catch (err: unknown) {
    console.error("STATUS_CHECK_ERROR:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
