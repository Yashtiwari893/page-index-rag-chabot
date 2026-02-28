import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { crawlWebsite, convertMarkdownToPdfBuffer } from "@/lib/firecrawlClient";
import { uploadDocument, waitUntilReady } from "@/lib/pageindexClient";

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        const { url, phoneNumber } = await req.json();
        if (!url || typeof url !== "string") {
            return NextResponse.json({ error: "url is required" }, { status: 400 });
        }

        // 1. Crawl site and get markdown pages
        const { pages } = await crawlWebsite(url);

        // 2. convert to pdf
        const pdfBuf = await convertMarkdownToPdfBuffer(pages);

        // 3. upload to PageIndex
        const domain = new URL(url).hostname.replace(/[:\\/]/g, "_");
        const filename = `${domain}.pdf`;
        const docId = await uploadDocument(pdfBuf, filename);
        await waitUntilReady(docId);

        // 4. record in rag_files
        const { data: fileRow, error: fileError } = await supabase
            .from("rag_files")
            .insert({ name: domain, doc_id: docId, type: "website" })
            .select()
            .single();
        if (fileError) throw fileError;

        // 5. optionally map phone number
        if (phoneNumber) {
            const { data: existing, error: mapError } = await supabase
                .from("phone_document_mapping")
                .select("doc_ids")
                .eq("phone_number", phoneNumber)
                .single();

            if (mapError && mapError.code !== "PGRST116") {
                throw mapError;
            }

            if (existing && Array.isArray(existing.doc_ids)) {
                const updated = Array.from(new Set([...(existing.doc_ids || []), docId]));
                await supabase
                    .from("phone_document_mapping")
                    .update({ doc_ids: updated })
                    .eq("phone_number", phoneNumber);
            } else {
                await supabase
                    .from("phone_document_mapping")
                    .insert({ phone_number: phoneNumber, doc_ids: [docId] });
            }
        }

        return NextResponse.json({
            success: true,
            doc_id: docId,
            pageCount: pages.length,
            pagesProcessed: pages.length,
        });
    } catch (err: unknown) {
        console.error("PROCESS_URL_ERROR:", err);
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
