import { supabase } from "./supabaseClient";

/**
 * Get all file IDs mapped to a phone number
 */
export async function getFilesForPhoneNumber(phoneNumber: string): Promise<string[]> {
    const { data, error } = await supabase
        .from("phone_document_mapping")
        .select("doc_ids")
        .eq("phone_number", phoneNumber)
        .single();

    if (error) {
        console.error("Error fetching files for phone number:", error);
        return [];
    }

    return data?.doc_ids || [];
}

/**
 * Check if a phone number has any document mappings
 */
export async function hasDocumentMapping(phoneNumber: string): Promise<boolean> {
    const { data, error } = await supabase
        .from("phone_document_mapping")
        .select("doc_ids")
        .eq("phone_number", phoneNumber)
        .single();

    if (error) {
        console.error("Error checking document mapping:", error);
        return false;
    }

    return Array.isArray(data?.doc_ids) && data.doc_ids.length > 0;
}
