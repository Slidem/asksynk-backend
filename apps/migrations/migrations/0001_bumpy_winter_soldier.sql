
-- Used by the outbox dispatcher to wake up immediately when a new event is inserted, instead of waiting for the next poll interval.
CREATE OR REPLACE FUNCTION notify_all_new() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('outbox_new', '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER outbox_new_notify
AFTER INSERT ON events_outbox
FOR EACH ROW EXECUTE FUNCTION notify_all_new();

-- Used to notify realtime listeners when a new event is inserted with delivery_mode 'realtime' or 'dual'.
-- This is different from the outbox_new notification as it includes the payload of the event and is only triggered for events that should be delivered in realtime.
-- Used for realtime fan-out notifications, for example to websocket servers that want to push events to clients immediately.
CREATE OR REPLACE FUNCTION notify_realtime() RETURNS trigger AS $$
BEGIN
  IF NEW.delivery_mode IN ('realtime', 'dual') THEN
    PERFORM pg_notify(
      'evt:' || NEW.event_type,
      json_build_object('id', NEW.id, 'payload', NEW.payload::json)::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_outbox_notify
AFTER INSERT ON events_outbox
FOR EACH ROW EXECUTE FUNCTION notify_realtime();

