/**
 * PageIndex AI API Client
 * This client handles document management and RAG-based chat using PageIndex API.
 */

const PAGEINDEX_BASE_URL = "https://api.pageindex.ai";
const PAGEINDEX_API_KEY = process.env.PAGEINDEX_API_KEY;

export type PageIndexMessage = {
    role: "user" | "assistant" | "system";
    content: string;
};

export type PageIndexStatusResponse = {
    status: string;
    retrieval_ready: boolean;
    result?: any;
};

export type PageIndexChatResponse = {
    choices: {
        message: {
            role: string;
            content: string;
        };
    }[];
};

export type PageIndexDocument = {
    doc_id: string;
    filename: string;
    created_at: string;
};

/**
 * Upload a document to PageIndex
 */
export async function uploadDocument(file: File | Buffer, filename: string, mode = "mcp"): Promise<string> {
    if (!PAGEINDEX_API_KEY) throw new Error("PAGEINDEX_API_KEY is not configured");

    const formData = new FormData();
    const blob = (typeof Buffer !== 'undefined' && Buffer.isBuffer(file))
        ? new Blob([new Uint8Array(file)])
        : file as Blob;
    formData.append("file", blob, filename);
    formData.append("mode", mode);

    const response = await fetch(`${PAGEINDEX_BASE_URL}/doc/`, {
        method: "POST",
        headers: {
            "api_key": PAGEINDEX_API_KEY,
        },
        body: formData,
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`PageIndex upload failed: ${error}`);
    }

    const data = await response.json();
    return data.doc_id;
}

/**
 * Check the processing status of a document
 */
export async function checkStatus(docId: string): Promise<PageIndexStatusResponse> {
    if (!PAGEINDEX_API_KEY) throw new Error("PAGEINDEX_API_KEY is not configured");

    const response = await fetch(`${PAGEINDEX_BASE_URL}/doc/${docId}/`, {
        method: "GET",
        headers: {
            "api_key": PAGEINDEX_API_KEY,
        },
    });

    if (!response.ok) {
        throw new Error(`PageIndex status check failed: ${response.statusText}`);
    }

    return await response.json();
}

/**
 * Polling function to wait until a document is ready for retrieval
 */
export async function waitUntilReady(docId: string, maxWaitMs = 120000, intervalMs = 3000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        const { status, retrieval_ready } = await checkStatus(docId);

        if (status === "completed" && retrieval_ready) {
            console.log(`Document ${docId} is ready.`);
            return;
        }

        if (status === "failed") {
            throw new Error(`Document processing failed for ${docId}`);
        }

        console.log(`Document ${docId} still processing (status: ${status}). Waiting...`);
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Timeout waiting for document ${docId} to be ready`);
}

/**
 * Perform RAG-based chat with one or more documents
 */
export async function chatWithDocs(
    docIds: string[] | string,
    messages: PageIndexMessage[],
    systemPrompt?: string
): Promise<string> {
    if (!PAGEINDEX_API_KEY) throw new Error("PAGEINDEX_API_KEY is not configured");
    const ids = Array.isArray(docIds) ? docIds : [docIds];
    if (ids.length === 0) throw new Error("No doc_ids provided for chat");

    const chatMessages = [...messages];
    if (systemPrompt) {
        chatMessages.unshift({ role: "system", content: systemPrompt });
    }

    const response = await fetch(`${PAGEINDEX_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            "api_key": PAGEINDEX_API_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            doc_id: ids.length === 1 ? ids[0] : ids,
            messages: chatMessages,
            stream: false,
            enable_citations: true,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`PageIndex chat failed: ${error}`);
    }

    const data: PageIndexChatResponse = await response.json();
    return data.choices[0].message.content;
}

/**
 * List all documents in PageIndex
 */
export async function listDocuments(limit = 50, offset = 0): Promise<PageIndexDocument[]> {
    if (!PAGEINDEX_API_KEY) throw new Error("PAGEINDEX_API_KEY is not configured");

    const response = await fetch(`${PAGEINDEX_BASE_URL}/docs?limit=${limit}&offset=${offset}`, {
        method: "GET",
        headers: {
            "api_key": PAGEINDEX_API_KEY,
        },
    });

    if (!response.ok) {
        throw new Error(`PageIndex list docs failed: ${response.statusText}`);
    }

    return await response.json();
}

/**
 * Delete a document from PageIndex
 */
export async function deleteDocument(docId: string): Promise<void> {
    if (!PAGEINDEX_API_KEY) throw new Error("PAGEINDEX_API_KEY is not configured");

    const response = await fetch(`${PAGEINDEX_BASE_URL}/doc/${docId}/`, {
        method: "DELETE",
        headers: {
            "api_key": PAGEINDEX_API_KEY,
        },
    });

    if (!response.ok) {
        throw new Error(`PageIndex delete failed: ${response.statusText}`);
    }
}
