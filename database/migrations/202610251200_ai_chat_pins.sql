-- D-182 (owner): chats can be pinned to the top of the person's list.
-- Additive only: rollback = redeploy the previous release, which never reads it.
ALTER TABLE ai_conversations
  ADD COLUMN pinned_at DATETIME NULL COMMENT 'D-182: when the owner pinned this chat; NULL = not pinned';
