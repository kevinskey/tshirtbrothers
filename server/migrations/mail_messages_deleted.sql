-- Soft-delete for the admin mailbox. Rows are kept (their UID anchors the
-- incremental IMAP sync high-water mark — hard-deleting the newest message
-- would make the next sync re-import it) but hidden from every list.
ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_mail_messages_deleted ON mail_messages(deleted) WHERE deleted;
