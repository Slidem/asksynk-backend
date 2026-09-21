-- The dispatcher only drains 'durable' / 'dual' rows; realtime rows are delivered by notify_realtime.
-- Firing outbox_new for them only wakes the dispatcher for nothing.
DROP TRIGGER IF EXISTS outbox_new_notify ON events_outbox;--> statement-breakpoint
CREATE TRIGGER outbox_new_notify
AFTER INSERT ON events_outbox
FOR EACH ROW
WHEN (NEW.delivery_mode IN ('durable', 'dual'))
EXECUTE FUNCTION notify_all_new();
