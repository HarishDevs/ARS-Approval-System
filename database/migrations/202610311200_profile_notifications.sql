-- D-230 (owner: "a profile section with all the available data from the user
-- master… profile photo upload as well"): the person's own photo (a file in
-- the upload folder, like attachments) and a short "About me". Everything
-- else on the profile stays IT's (Admin → Users).
ALTER TABLE users
  ADD COLUMN photo_path       VARCHAR(255)  NULL AFTER whatsapp_number,
  ADD COLUMN photo_type       VARCHAR(40)   NULL AFTER photo_path,
  ADD COLUMN photo_updated_at DATETIME      NULL AFTER photo_type,
  ADD COLUMN about_me         VARCHAR(1000) NULL AFTER photo_updated_at;

-- D-231 (owner: "the notification control center for the whole app"): a
-- choice can switch off the in-app alert too (the message is still kept in
-- Notifications, already read), and a choice can be for one kind of message
-- ("E:<event>") as well as for a group.
ALTER TABLE notification_preferences
  MODIFY COLUMN channel ENUM('EMAIL', 'WHATSAPP', 'INAPP') NOT NULL;
