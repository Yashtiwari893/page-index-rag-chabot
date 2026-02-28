-- =========================================
-- PageIndex AI Integration Migration
-- =========================================

-- Table to map phone numbers to PageIndex doc_ids
CREATE TABLE IF NOT EXISTS phone_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL,
  doc_id TEXT NOT NULL,           -- PageIndex doc_id
  filename TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster retrieval by phone number
CREATE INDEX IF NOT EXISTS idx_phone_documents_phone_number ON phone_documents(phone_number);

-- Note: We are keeping old tables for now to avoid data loss,
-- but the new logic will use phone_documents.
