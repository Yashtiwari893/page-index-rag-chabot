/**
 * PageIndex AI API client
 * Implements upload/check/chat/list/delete with robust error handling.
 * REMOVED: waitUntilReady() - use client-side polling instead to avoid serverless timeout.
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
    [k: string]: any;
};

export type PageIndexDocument = {
    doc_id: string;
    filename: string;
    created_at: string;
    [k: string]: any;
};

function requireKey() {
    if (!PAGEINDEX_API_KEY) {
        throw new Error("PAGEINDEX_API_KEY is not configured in environment");
    }
}

function buildHeaders(extra: Record<string, string> = {}) {
    return {
        api_key: PAGEINDEX_API_KEY as string,
        ...extra,
    } as Record<string, string>;
}

/** Upload a file (Buffer or File) to PageIndex. Returns doc_id string. */
export async function uploadDocument(file: File | Buffer, filename?: string): Promise<string> {
    requireKey();

    const form = new FormData();

    let blob: Blob;
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(file)) {
        blob = new Blob([new Uint8Array(file as Buffer)]);
    } else if (file instanceof Blob) {
        blob = file as Blob;
    } else {
        throw new Error("Unsupported file type for uploadDocument");
    }

    form.append("file", blob, filename || "upload.pdf");
    // PageIndex docs mention a mode field (e.g. mcp)
    form.append("mode", "mcp");

    const res = await fetch(`${PAGEINDEX_BASE_URL}/doc/`, {
        method: "POST",
        headers: buildHeaders(),
        body: form as unknown as BodyInit,
    });

    if (!res.ok) {
        const txt = await res.text().catch(() => "<no body>");
        throw new Error(`PageIndex upload failed: ${res.status} ${res.statusText} - ${txt}`);
    }

    const data = await res.json().catch((e) => {
        throw new Error(`Failed to parse PageIndex upload response: ${String(e)}`);
    });

    if (!data || !data.doc_id) {
        throw new Error(`PageIndex upload did not return doc_id: ${JSON.stringify(data)}`);
    }

    return data.doc_id;
}

/** Check processing status for a doc_id. Returns { status, retrieval_ready } */
export async function checkStatus(docId: string): Promise<PageIndexStatusResponse> {
    requireKey();

    const res = await fetch(`${PAGEINDEX_BASE_URL}/doc/${encodeURIComponent(docId)}/`, {
        method: "GET",
        headers: buildHeaders(),
    });

    if (!res.ok) {
        const txt = await res.text().catch(() => "<no body>");
        throw new Error(`PageIndex status check failed: ${res.status} ${res.statusText} - ${txt}`);
    }

    const data = await res.json();
    console.log(`[PageIndex Status] doc_id=${docId}, status=${data.status}, retrieval_ready=${data.retrieval_ready}`);
    return data;
}

/**
 * Chat with documents using PageIndex API.
 * @param docIds - single doc_id string or array of doc_ids
 * @param messages - array of messages
 * @param opts - options including systemPrompt, stream, enableCitations
 */
export async function chatWithDocs(
    docIds: string | string[],
    messages: PageIndexMessage[],
    opts?: { systemPrompt?: string; stream?: boolean; enableCitations?: boolean }
): Promise<string | Response> {
    requireKey();

    const payload: any = {
        doc_id: Array.isArray(docIds) ? (docIds.length === 1 ? docIds[0] : docIds) : docIds,
        messages: messages,
        stream: !!opts?.stream,
        enable_citations: opts?.enableCitations ?? true,
    };

    if (opts?.systemPrompt) {
        // Prepend system prompt as the first message
        payload.messages = [{ role: "system", content: opts.systemPrompt }, ...messages];
    }

    const res = await fetch(`${PAGEINDEX_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: buildHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const txt = await res.text().catch(() => "<no body>");
        throw new Error(`PageIndex chat failed: ${res.status} ${res.statusText} - ${txt}`);
    }

    if (opts?.stream) {
        // Return raw response so caller can stream body
        return res;
    }

    const data = (await res.json()) as PageIndexChatResponse;
    if (!data || !data.choices || data.choices.length === 0) {
        throw new Error(`PageIndex chat returned no choices: ${JSON.stringify(data)}`);
    }

    return data.choices[0].message.content;
}

/** List documents. */
export async function listDocuments(limit = 50, offset = 0): Promise<PageIndexDocument[]> {
    requireKey();

    const res = await fetch(`${PAGEINDEX_BASE_URL}/docs?limit=${limit}&offset=${offset}`, {
        method: "GET",
        headers: buildHeaders(),
    });

    if (!res.ok) {
        const txt = await res.text().catch(() => "<no body>");
        throw new Error(`PageIndex list docs failed: ${res.status} ${res.statusText} - ${txt}`);
    }

    return await res.json();
}

/** Delete a document by doc_id. */
export async function deleteDocument(docId: string): Promise<void> {
    requireKey();

    const res = await fetch(`${PAGEINDEX_BASE_URL}/doc/${encodeURIComponent(docId)}/`, {
        method: "DELETE",
        headers: buildHeaders(),
    });

    if (!res.ok) {
        const txt = await res.text().catch(() => "<no body>");
        throw new Error(`PageIndex delete failed: ${res.status} ${res.statusText} - ${txt}`);
    }
}

