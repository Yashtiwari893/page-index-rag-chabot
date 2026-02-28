import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET() {
    try {
        // 1. Get all phone mappings (metadata like intent, prompt, credentials)
        const { data: mappings, error: mappingError } = await supabase
            .from("phone_document_mapping")
            .select(`
                phone_number,
                intent,
                system_prompt,
                auth_token,
                origin
            `)
            .order("phone_number", { ascending: true });

        if (mappingError) throw mappingError;

        // 2. Get all PageIndex documents
        const { data: piDocs, error: piError } = await supabase
            .from("phone_documents")
            .select("*")
            .order("uploaded_at", { ascending: false });

        if (piError) throw piError;

        // 3. Get legacy rag_files for backward compatibility (optional but good for transition)
        const { data: legacyMappings, error: legacyError } = await supabase
            .from("phone_document_mapping")
            .select(`
                phone_number,
                rag_files (id, name, file_type, created_at)
            `)
            .not("file_id", "is", null);

        if (legacyError) throw legacyError;

        // Group everything by phone number
        const phoneGroups: Record<string, any> = {};

        // Initialize groups from mappings
        mappings?.forEach((m: any) => {
            if (!phoneGroups[m.phone_number]) {
                phoneGroups[m.phone_number] = {
                    ...m,
                    files: []
                };
            }
        });

        // Add PageIndex documents
        piDocs?.forEach((doc: any) => {
            const phone = doc.phone_number;
            if (!phoneGroups[phone]) {
                // If no mapping exists yet, create one
                phoneGroups[phone] = {
                    phone_number: phone,
                    intent: null,
                    system_prompt: null,
                    auth_token: "",
                    origin: "",
                    files: []
                };
            }
            phoneGroups[phone].files.push({
                id: doc.doc_id, // We use doc_id as the ID for PageIndex files
                name: doc.filename,
                file_type: "PageIndex",
                chunk_count: "Indexed",
                created_at: doc.uploaded_at,
                is_pageindex: true
            });
        });

        // Add legacy files
        legacyMappings?.forEach((m: any) => {
            const phone = m.phone_number;
            const file = m.rag_files;
            if (file && phoneGroups[phone]) {
                phoneGroups[phone].files.push({
                    id: file.id,
                    name: file.name,
                    file_type: file.file_type || "pdf",
                    chunk_count: "Legacy",
                    created_at: file.created_at,
                    is_legacy: true
                });
            }
        });

        return NextResponse.json({
            success: true,
            groups: Object.values(phoneGroups),
        });

    } catch (error) {
        console.error("Error fetching phone groups:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to fetch phone groups" },
            { status: 500 }
        );
    }
}
