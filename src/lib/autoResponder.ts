import { supabase } from "./supabaseClient";
import { chatWithDocs } from "./pageindexClient";
import { sendWhatsAppMessage } from "./whatsappSender";

export type AutoResponseResult = {
    success: boolean;
    response?: string;
    error?: string;
    noDocuments?: boolean;
    sent?: boolean;
};

/**
 * Generate an automatic response for a WhatsApp message using PageIndex AI
 */
export async function generateAutoResponse(
    fromNumber: string,
    toNumber: string,
    messageText: string,
    messageId: string
): Promise<AutoResponseResult> {
    try {
        // 1. Get all PageIndex doc_ids mapped to this business number
        const { data: docRows, error: docError } = await supabase
            .from("phone_documents")
            .select("doc_id")
            .eq("phone_number", toNumber);

        if (docError) {
            console.error("Error fetching phone documents:", docError);
            return { success: false, error: "Failed to fetch document mappings" };
        }

        const docIds = docRows?.map(row => row.doc_id) || [];

        if (docIds.length === 0) {
            console.log(`No documents found in PageIndex for business number: ${toNumber}`);
            return {
                success: false,
                noDocuments: true,
                error: "No documents mapped to this business number",
            };
        }

        // 2. Fetch phone mapping details (system prompt and credentials)
        const { data: phoneMappings, error: mappingError } = await supabase
            .from("phone_document_mapping")
            .select("system_prompt, auth_token, origin")
            .eq("phone_number", toNumber);

        if (mappingError || !phoneMappings || phoneMappings.length === 0) {
            console.error("Error fetching phone mapping details:", mappingError);
            return {
                success: false,
                error: "Failed to fetch phone configuration",
            };
        }

        const customSystemPrompt = phoneMappings[0].system_prompt;
        const auth_token = phoneMappings[0].auth_token;
        const origin = phoneMappings[0].origin;

        if (!auth_token || !origin) {
            return {
                success: false,
                error: "WhatsApp API credentials missing for this number",
            };
        }

        // 3. Get conversation history
        const { data: historyRows } = await supabase
            .from("whatsapp_messages")
            .select("content_text, event_type")
            .or(`from_number.eq.${fromNumber},to_number.eq.${fromNumber}`)
            .order("received_at", { ascending: true })
            .limit(15);

        const history = (historyRows || [])
            .filter((m: any) => m.content_text && (m.event_type === "MoMessage" || m.event_type === "MtMessage"))
            .map((m: any) => ({
                role: (m.event_type === "MoMessage" ? "user" : "assistant") as "user" | "assistant",
                content: m.content_text
            }));

        // 4. Generate response using PageIndex Chat API
        const documentRules =
            `Your ONLY job is to answer questions based strictly on the provided documents.\n` +
            `- If the answer is not in the documents, say "I don't have that information."\n` +
            `- Be concise, friendly, and use clear language for WhatsApp.\n` +
            `- Format with line breaks for readability.`;

        const finalSystemPrompt = customSystemPrompt
            ? `${customSystemPrompt}\n\n${documentRules}`
            : `You are a helpful WhatsApp assistant.\n\n${documentRules}`;

        console.log(`Calling PageIndex chat for ${toNumber} with ${docIds.length} docs...`);

        const responseResult = await chatWithDocs(
            docIds,
            [...history, { role: "user", content: messageText }],
            { systemPrompt: finalSystemPrompt, stream: false, enableCitations: true }
        );

        const response = typeof responseResult === "string" ? responseResult : undefined;

        if (!response) {
            return { success: false, error: "Empty response from AI" };
        }

        // 5. Send via WhatsApp
        const sendResult = await sendWhatsAppMessage(fromNumber, response, auth_token, origin);

        if (!sendResult.success) {
            console.error("WhatsApp send failed:", sendResult.error);
            return { success: false, response, sent: false, error: sendResult.error };
        }

        // 6. Log the AI response in database
        const responseMessageId = `pi_${messageId}_${Date.now()}`;
        await supabase.from("whatsapp_messages").insert([{
            message_id: responseMessageId,
            channel: "whatsapp",
            from_number: toNumber,
            to_number: fromNumber,
            received_at: new Date().toISOString(),
            content_type: "text",
            content_text: response,
            sender_name: "AI Assistant",
            event_type: "MtMessage",
            raw_payload: { messageId: responseMessageId, isAutoResponse: true, provider: "pageindex" }
        }]);

        // 7. Mark original message as responded
        await supabase.from("whatsapp_messages")
            .update({ auto_respond_sent: true, response_sent_at: new Date().toISOString() })
            .eq("message_id", messageId);

        return { success: true, response, sent: true };

    } catch (error) {
        console.error("Auto-response error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}
