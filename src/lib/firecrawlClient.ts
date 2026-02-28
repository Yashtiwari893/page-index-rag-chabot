import fetch from "node-fetch";
import PDFDocument from "pdfkit";

export type CrawlPage = {
    markdown: string;
    sourceURL: string;
};

export type CrawlResult = {
    markdown: string;           // combined markdown
    pages: CrawlPage[];         // individual pages from crawl
};

/**
 * Crawl a website using Firecrawl API and return combined markdown
 */
export async function crawlWebsite(url: string, limit = 50): Promise<CrawlResult> {
    const key = process.env.FIRECRAWL_API_KEY;
    if (!key) {
        throw new Error("FIRECRAWL_API_KEY is not configured");
    }

    // kick off crawl
    const postResp = await fetch("https://api.firecrawl.dev/v2/crawl", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
            url,
            limit,
            scrapeOptions: { formats: ["markdown"] },
        }),
    });

    if (!postResp.ok) {
        const text = await postResp.text();
        throw new Error(`Firecrawl start failed: ${text}`);
    }

    const postData: any = await postResp.json();
    const crawlId = postData.id || postData.crawlId;
    if (!crawlId) {
        throw new Error("Firecrawl response missing crawl id");
    }

    // poll status
    const start = Date.now();
    let statusData: any = null;
    while (Date.now() - start < 120000) {
        await new Promise((r) => setTimeout(r, 3000));
        const statusResp = await fetch(`https://api.firecrawl.dev/v2/crawl/${crawlId}`, {
            headers: {
                Authorization: `Bearer ${key}`,
            },
        });
        if (!statusResp.ok) {
            const text = await statusResp.text();
            throw new Error(`Firecrawl status check failed: ${text}`);
        }
        statusData = await statusResp.json();
        if (statusData.status === "completed") break;
        if (statusData.status === "failed") {
            throw new Error("Firecrawl job failed");
        }
        // otherwise continue polling
    }

    if (!statusData || statusData.status !== "completed") {
        throw new Error("Firecrawl timed out before completion");
    }

    // extract pages
    const rawPages: any[] = statusData.results || statusData.pages || [];
    const pages: CrawlPage[] = rawPages.map((p) => ({
        markdown: p.markdown || "",
        sourceURL: p.metadata?.sourceURL || p.metadata?.source_url || "",
    }));

    const combined = pages
        .map((p) => `\n\n---\n\n# Source: ${p.sourceURL}\n\n${p.markdown}`)
        .join("\n");

    return { markdown: combined, pages };
}

/**
 * Convert array of markdown pages into a single PDF stored in a Buffer.
 * Each page of the crawl becomes a new page in the PDF with a header
 * indicating the source URL.
 */
export async function convertMarkdownToPdfBuffer(pages: CrawlPage[]): Promise<Buffer> {
    const doc = new PDFDocument({ autoFirstPage: false });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));

    const finished = new Promise<Buffer>((resolve, reject) => {
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
    });

    pages.forEach((p) => {
        doc.addPage();
        doc.fontSize(12).text(`Source: ${p.sourceURL}`, { underline: true });
        doc.moveDown();
        // rudimentary markdown: just output raw text
        doc.fontSize(10).text(p.markdown);
    });

    doc.end();
    return finished;
}
