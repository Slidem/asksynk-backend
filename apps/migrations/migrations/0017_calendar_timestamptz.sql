-- Calendar instants: store true UTC instants as timestamptz (values already hold UTC digits).
ALTER TABLE "calendar_events" ALTER COLUMN "start" SET DATA TYPE timestamp with time zone USING "start" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendar_events" ALTER COLUMN "original_start" SET DATA TYPE timestamp with time zone USING "original_start" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendar_events" ALTER COLUMN "recurrence_end" SET DATA TYPE timestamp with time zone USING "recurrence_end" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "calendar_event_exceptions" ALTER COLUMN "original_start" SET DATA TYPE timestamp with time zone USING "original_start" AT TIME ZONE 'UTC';--> statement-breakpoint

-- Drop the naive-timestamp rrule API: it expands in UTC and drifts across DST.
DROP FUNCTION IF EXISTS rrule."all"(varchar, timestamp);--> statement-breakpoint
DROP FUNCTION IF EXISTS rrule."between"(varchar, timestamp, timestamp, timestamp);--> statement-breakpoint
DROP FUNCTION IF EXISTS rrule."after"(varchar, timestamp, timestamp);--> statement-breakpoint
DROP FUNCTION IF EXISTS rrule."before"(varchar, timestamp, timestamp);--> statement-breakpoint
DROP FUNCTION IF EXISTS rrule."count"(varchar, timestamp);--> statement-breakpoint
DROP FUNCTION IF EXISTS rrule."next"(varchar, timestamp);--> statement-breakpoint
DROP FUNCTION IF EXISTS rrule."most_recent"(varchar, timestamp);--> statement-breakpoint

-- UNTIL is a UTC instant: compare it against the wall-clock occurrence converted from tz_name.
-- TimeZone pinned to UTC: the helpers cast naive wall-clock values to timestamptz.
DROP FUNCTION IF EXISTS rrule.rrule_event_instances_range_tz(timestamp, text, timestamp, timestamp, int);--> statement-breakpoint
CREATE OR REPLACE FUNCTION rrule.rrule_event_instances_range_tz(
    basedate TIMESTAMP,              -- Naive timestamp (wall-clock time in target timezone)
    repeatrule TEXT,                 -- RRULE string
    mindate TIMESTAMP,               -- Naive timestamp (range start)
    maxdate TIMESTAMP,               -- Naive timestamp (range end)
    max_count INT,                   -- Maximum iterations
    tz_name TEXT DEFAULT 'UTC'       -- Zone of the wall-clock values (UNTIL is UTC)
) RETURNS SETOF TIMESTAMP AS $$
#variable_conflict use_variable
DECLARE
    loopmax INT;
    loopcount INT;
    base_day TIMESTAMP;
    current_base TIMESTAMP;
    current TIMESTAMP;
    rrule rrule.rrule_parts%ROWTYPE;
BEGIN
    loopcount := 0;

    -- Parse the RRULE (note: basedate is converted to TIMESTAMPTZ for parsing, but only for date extraction)
    SELECT * INTO rrule FROM rrule.parse_rrule_parts( basedate::TIMESTAMPTZ, repeatrule );

    -- Security: Calculate safe iteration limit accounting for sparse BYxxx filters
    -- (e.g., FREQ=DAILY;BYDAY=MO only matches 1/7 days, requiring 20x headroom)
    -- See calculate_safe_iteration_limit() for detailed security rationale.
    loopmax := rrule.calculate_safe_iteration_limit(rrule.freq, rrule.count, max_count);

    current_base := basedate;
    base_day := date_trunc('day', basedate);

    WHILE loopcount < loopmax AND current_base < maxdate LOOP
        IF rrule.freq = 'DAILY' THEN
            -- Call the existing daily_set but convert to/from TIMESTAMPTZ for compatibility
            FOR current IN
                SELECT d::TIMESTAMP
                FROM rrule.daily_set(current_base::TIMESTAMPTZ, rrule) d
                WHERE d::TIMESTAMP >= base_day
            LOOP
                EXIT WHEN rrule.until IS NOT NULL AND (current AT TIME ZONE tz_name) > rrule.until;
                IF current >= mindate THEN
                    RETURN NEXT current;
                END IF;
                loopcount := loopcount + 1;
                EXIT WHEN loopcount >= loopmax;
            END LOOP;
            -- KEY FIX: Adding interval to naive TIMESTAMP preserves wall-clock time
            current_base := current_base + make_interval(days => rrule.interval);

        ELSIF rrule.freq = 'WEEKLY' THEN
            FOR current IN
                SELECT w::TIMESTAMP
                FROM rrule.weekly_set(current_base::TIMESTAMPTZ, rrule) w
                WHERE w::TIMESTAMP >= base_day
            LOOP
                -- Apply filters
                IF rrule.test_byyearday_rule(current::TIMESTAMPTZ, rrule.byyearday)
                   AND rrule.test_bymonthday_rule(current::TIMESTAMPTZ, rrule.bymonthday)
                   AND rrule.test_bymonth_rule(current::TIMESTAMPTZ, rrule.bymonth)
                THEN
                    EXIT WHEN rrule.until IS NOT NULL AND (current AT TIME ZONE tz_name) > rrule.until;
                    IF current >= mindate THEN
                        RETURN NEXT current;
                    END IF;
                    loopcount := loopcount + 1;
                    EXIT WHEN loopcount >= loopmax;
                END IF;
            END LOOP;
            current_base := current_base + make_interval(weeks => rrule.interval);

        ELSIF rrule.freq = 'MONTHLY' THEN
            FOR current IN
                SELECT m::TIMESTAMP
                FROM rrule.monthly_set(current_base::TIMESTAMPTZ, rrule) m
                WHERE m::TIMESTAMP >= base_day
            LOOP
                EXIT WHEN rrule.until IS NOT NULL AND (current AT TIME ZONE tz_name) > rrule.until;
                IF current >= mindate THEN
                    RETURN NEXT current;
                END IF;
                loopcount := loopcount + 1;
                EXIT WHEN loopcount >= loopmax;
            END LOOP;
            current_base := current_base + make_interval(months => rrule.interval);

        ELSIF rrule.freq = 'YEARLY' THEN
            FOR current IN
                SELECT y::TIMESTAMP
                FROM rrule.yearly_set(current_base::TIMESTAMPTZ, rrule) y
                WHERE y::TIMESTAMP >= base_day
            LOOP
                EXIT WHEN rrule.until IS NOT NULL AND (current AT TIME ZONE tz_name) > rrule.until;
                IF current >= mindate THEN
                    RETURN NEXT current;
                END IF;
                loopcount := loopcount + 1;
                EXIT WHEN loopcount >= loopmax;
            END LOOP;
            current_base := current_base + make_interval(years => rrule.interval);

        ELSE
            RAISE EXCEPTION 'Unsupported frequency: %', rrule.freq;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = rrule, pg_catalog SET TimeZone = 'UTC';
--> statement-breakpoint

CREATE OR REPLACE FUNCTION rrule."between"(
    rrule_string TEXT,
    dtstart TIMESTAMPTZ,
    range_start TIMESTAMPTZ,
    range_end TIMESTAMPTZ,
    timezone TEXT DEFAULT NULL
) RETURNS SETOF TIMESTAMPTZ AS $$
DECLARE
    tz_name TEXT;
    naive_occurrence TIMESTAMP;
BEGIN
    tz_name := COALESCE(
        timezone,
        substring(rrule_string from 'TZID=([^;]+)(;|$)'),
        'UTC'
    );

    PERFORM rrule.validate_timezone(tz_name);

    FOR naive_occurrence IN
        SELECT * FROM rrule.rrule_event_instances_range_tz(
            dtstart AT TIME ZONE tz_name,
            rrule_string,
            range_start AT TIME ZONE tz_name,
            range_end AT TIME ZONE tz_name,
            1000,
            tz_name
        )
    LOOP
        RETURN NEXT (naive_occurrence AT TIME ZONE tz_name);
    END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;--> statement-breakpoint

-- Event timezone is passed explicitly to rrule.between; TZID in the rule is redundant.
UPDATE "calendar_events"
SET "rrule" = regexp_replace(regexp_replace("rrule", 'TZID=[^;]*;?', '', 'gi'), ';$', '')
WHERE "rrule" ~* 'TZID=';--> statement-breakpoint

-- Force a full re-list so imported events are re-parsed (provider offsets) and patched in place.
UPDATE "calendars" SET "sync_token" = NULL WHERE "source" <> 'asksynk';
