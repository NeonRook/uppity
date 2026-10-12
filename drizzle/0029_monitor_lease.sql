-- Custom migration: drizzle-kit does not manage functions, so it never regenerates this one.
-- Seconds a claim holds a monitor: every attempt timing out, each followed by the
-- pause before the next, plus room for the writes. The monitor table's constraints
-- bound timeout_seconds and retries.
CREATE FUNCTION monitor_lease_seconds(timeout_seconds integer, retries integer, retry_delay_ms integer)
RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT (timeout_seconds + CEIL(retry_delay_ms / 1000.0)::integer) * (retries + 1) + 30 $$;
