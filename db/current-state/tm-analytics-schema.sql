CREATE SCHEMA IF NOT EXISTS analytics;

-- ============================================================================
-- Multi-snapshot full-rebuild analytics model with immutable snapshot reads.
-- This script is intentionally rerunnable from scratch via explicit drops.
-- ============================================================================

DROP PROCEDURE IF EXISTS analytics.run_snapshot_refresh_batch(BOOLEAN);
DROP PROCEDURE IF EXISTS analytics.run_snapshot_refresh_batch();
DROP PROCEDURE IF EXISTS analytics.refresh_snapshot_filter_facts(BIGINT);
DROP PROCEDURE IF EXISTS analytics.refresh_snapshot_filter_facts_from_tables(
  BIGINT,
  REGCLASS,
  REGCLASS,
  REGCLASS,
  REGCLASS,
  REGCLASS,
  REGCLASS,
  REGCLASS
);
DROP PROCEDURE IF EXISTS analytics.refresh_snapshot_filter_facts_from_tables(
  BIGINT,
  REGCLASS,
  REGCLASS,
  REGCLASS,
  REGCLASS,
  REGCLASS,
  REGCLASS,
  REGCLASS,
  REGCLASS
);
DROP PROCEDURE IF EXISTS analytics.cleanup_snapshot_partitions(BIGINT);
DROP PROCEDURE IF EXISTS analytics.cleanup_snapshot_retention();
DROP PROCEDURE IF EXISTS analytics.refresh_snapshot_filter_facet_facts(BIGINT);

-- Snapshot tables
DROP TABLE IF EXISTS analytics.snapshot_task_rows CASCADE;
DROP TABLE IF EXISTS analytics.snapshot_filter_facet_facts CASCADE;
DROP TABLE IF EXISTS analytics.snapshot_user_filter_facts CASCADE;
DROP TABLE IF EXISTS analytics.snapshot_completed_filter_facts CASCADE;
DROP TABLE IF EXISTS analytics.snapshot_outstanding_filter_facts CASCADE;
DROP TABLE IF EXISTS analytics.snapshot_overview_filter_facts CASCADE;
DROP TABLE IF EXISTS analytics.snapshot_wait_time_by_assigned_date CASCADE;
DROP TABLE IF EXISTS analytics.snapshot_task_event_daily_facts CASCADE;
DROP TABLE IF EXISTS analytics.snapshot_open_due_daily_facts CASCADE;
DROP TABLE IF EXISTS analytics.snapshot_outstanding_created_assignment_daily_facts CASCADE;
DROP TABLE IF EXISTS analytics.snapshot_outstanding_due_status_daily_facts CASCADE;
DROP TABLE IF EXISTS analytics.snapshot_completed_dashboard_facts CASCADE;
DROP TABLE IF EXISTS analytics.snapshot_user_completed_facts CASCADE;
DROP TABLE IF EXISTS analytics.snapshot_completed_task_rows CASCADE;
DROP TABLE IF EXISTS analytics.snapshot_open_task_rows CASCADE;

-- Metadata/state
DROP TABLE IF EXISTS analytics.snapshot_state CASCADE;
DROP TABLE IF EXISTS analytics.snapshot_batches CASCADE;
DROP SEQUENCE IF EXISTS analytics.snapshot_id_seq;

-- Snapshot metadata
CREATE SEQUENCE analytics.snapshot_id_seq;

CREATE TABLE analytics.snapshot_batches (
  snapshot_id BIGINT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  error_message TEXT
);

CREATE TABLE analytics.snapshot_state (
  -- Single-row control table: tracks current publish pointer.
  singleton_id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton_id),
  published_snapshot_id BIGINT REFERENCES analytics.snapshot_batches(snapshot_id),
  published_at TIMESTAMPTZ,
  in_progress_snapshot_id BIGINT REFERENCES analytics.snapshot_batches(snapshot_id)
);

INSERT INTO analytics.snapshot_state (singleton_id) VALUES (TRUE);

-- Snapshot data tables (immutable rows keyed by snapshot_id).
CREATE TABLE analytics.snapshot_open_task_rows (
  snapshot_id BIGINT NOT NULL REFERENCES analytics.snapshot_batches(snapshot_id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  case_id TEXT,
  task_name TEXT,
  case_type_label TEXT,
  jurisdiction_label TEXT,
  role_category_label TEXT,
  region TEXT,
  location TEXT,
  work_type TEXT,
  state TEXT NOT NULL,
  created_date DATE,
  first_assigned_date DATE,
  due_date DATE,
  major_priority INTEGER,
  assignee TEXT,
  number_of_reassignments INTEGER NOT NULL DEFAULT 0
) PARTITION BY LIST (snapshot_id);

CREATE TABLE analytics.snapshot_completed_task_rows (
  snapshot_id BIGINT NOT NULL REFERENCES analytics.snapshot_batches(snapshot_id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  case_id TEXT,
  task_name TEXT,
  jurisdiction_label TEXT,
  role_category_label TEXT,
  region TEXT,
  location TEXT,
  work_type TEXT,
  created_date DATE,
  first_assigned_date DATE,
  due_date DATE,
  completed_date DATE,
  handling_time_days DOUBLE PRECISION,
  is_within_sla TEXT,
  termination_process_label TEXT,
  outcome TEXT,
  major_priority INTEGER,
  assignee TEXT,
  number_of_reassignments INTEGER NOT NULL DEFAULT 0,
  within_due_sort_value SMALLINT
) PARTITION BY LIST (snapshot_id);

CREATE TABLE analytics.snapshot_user_completed_facts (
  snapshot_id BIGINT NOT NULL REFERENCES analytics.snapshot_batches(snapshot_id) ON DELETE CASCADE,
  assignee TEXT,
  jurisdiction_label TEXT,
  role_category_label TEXT,
  region TEXT,
  location TEXT,
  task_name TEXT,
  work_type TEXT,
  completed_date DATE,
  tasks INTEGER NOT NULL,
  within_due INTEGER NOT NULL,
  beyond_due INTEGER NOT NULL,
  handling_time_sum NUMERIC NOT NULL,
  handling_time_count INTEGER NOT NULL,
  days_beyond_sum NUMERIC NOT NULL,
  days_beyond_count INTEGER NOT NULL
) PARTITION BY LIST (snapshot_id);

CREATE TABLE analytics.snapshot_completed_dashboard_facts (
  snapshot_id BIGINT NOT NULL REFERENCES analytics.snapshot_batches(snapshot_id) ON DELETE CASCADE,
  reference_date DATE NOT NULL,
  jurisdiction_label TEXT,
  role_category_label TEXT,
  region TEXT,
  location TEXT,
  task_name TEXT,
  work_type TEXT,
  total_task_count BIGINT NOT NULL,
  within_task_count BIGINT NOT NULL,
  handling_time_days_sum NUMERIC NOT NULL,
  handling_time_days_sum_squares NUMERIC NOT NULL,
  handling_time_days_count BIGINT NOT NULL,
  processing_time_days_sum NUMERIC NOT NULL,
  processing_time_days_sum_squares NUMERIC NOT NULL,
  processing_time_days_count BIGINT NOT NULL
) PARTITION BY LIST (snapshot_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_snapshot_completed_dashboard_facts_snapshot_key
  ON ONLY analytics.snapshot_completed_dashboard_facts(
    snapshot_id,
    reference_date,
    jurisdiction_label,
    role_category_label,
    region,
    location,
    task_name,
    work_type
  );

CREATE INDEX IF NOT EXISTS ix_snapshot_completed_dashboard_facts_snapshot_reference_date
  ON ONLY analytics.snapshot_completed_dashboard_facts(snapshot_id, reference_date);

CREATE INDEX IF NOT EXISTS ix_snapshot_completed_dashboard_facts_snapshot_slicers
  ON ONLY analytics.snapshot_completed_dashboard_facts(
    snapshot_id,
    jurisdiction_label,
    role_category_label,
    region,
    location,
    task_name,
    work_type
  );

CREATE TABLE analytics.snapshot_outstanding_due_status_daily_facts (
  snapshot_id BIGINT NOT NULL REFERENCES analytics.snapshot_batches(snapshot_id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  jurisdiction_label TEXT,
  role_category_label TEXT,
  region TEXT,
  location TEXT,
  task_name TEXT,
  work_type TEXT,
  open_task_count BIGINT NOT NULL,
  completed_task_count BIGINT NOT NULL
) PARTITION BY LIST (snapshot_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_snapshot_outstanding_due_status_facts_key
  ON ONLY analytics.snapshot_outstanding_due_status_daily_facts(
    snapshot_id,
    due_date,
    jurisdiction_label,
    role_category_label,
    region,
    location,
    task_name,
    work_type
  );

CREATE INDEX IF NOT EXISTS ix_snapshot_outstanding_due_status_facts_due_date
  ON ONLY analytics.snapshot_outstanding_due_status_daily_facts(snapshot_id, due_date)
  INCLUDE (open_task_count, completed_task_count);

CREATE INDEX IF NOT EXISTS ix_snapshot_outstanding_due_status_facts_slicers
  ON ONLY analytics.snapshot_outstanding_due_status_daily_facts(
    snapshot_id,
    jurisdiction_label,
    role_category_label,
    region,
    location,
    task_name,
    work_type
  );

CREATE TABLE analytics.snapshot_outstanding_created_assignment_daily_facts (
  snapshot_id BIGINT NOT NULL REFERENCES analytics.snapshot_batches(snapshot_id) ON DELETE CASCADE,
  reference_date DATE NOT NULL,
  jurisdiction_label TEXT,
  role_category_label TEXT,
  region TEXT,
  location TEXT,
  task_name TEXT,
  work_type TEXT,
  assignment_state TEXT,
  task_count BIGINT NOT NULL
) PARTITION BY LIST (snapshot_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_snapshot_outstanding_created_assignment_facts_key
  ON ONLY analytics.snapshot_outstanding_created_assignment_daily_facts(
    snapshot_id,
    reference_date,
    jurisdiction_label,
    role_category_label,
    region,
    location,
    task_name,
    work_type,
    assignment_state
  );

CREATE INDEX IF NOT EXISTS ix_snapshot_outstanding_created_assignment_facts_ref_date
  ON ONLY analytics.snapshot_outstanding_created_assignment_daily_facts(snapshot_id, reference_date);

CREATE INDEX IF NOT EXISTS ix_snapshot_outstanding_created_assignment_facts_slicers
  ON ONLY analytics.snapshot_outstanding_created_assignment_daily_facts(
    snapshot_id,
    jurisdiction_label,
    role_category_label,
    region,
    location,
    task_name,
    work_type,
    assignment_state
  );

CREATE TABLE analytics.snapshot_open_due_daily_facts (
  snapshot_id BIGINT NOT NULL REFERENCES analytics.snapshot_batches(snapshot_id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  jurisdiction_label TEXT,
  role_category_label TEXT,
  region TEXT,
  location TEXT,
  task_name TEXT,
  work_type TEXT,
  priority BIGINT NOT NULL,
  assignment_state TEXT NOT NULL,
  task_count BIGINT NOT NULL
) PARTITION BY LIST (snapshot_id);

CREATE TABLE analytics.snapshot_task_event_daily_facts (
  snapshot_id BIGINT NOT NULL REFERENCES analytics.snapshot_batches(snapshot_id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'completed', 'cancelled')),
  jurisdiction_label TEXT,
  role_category_label TEXT,
  region TEXT,
  location TEXT,
  task_name TEXT,
  work_type TEXT,
  task_count BIGINT NOT NULL
) PARTITION BY LIST (snapshot_id);

CREATE TABLE analytics.snapshot_wait_time_by_assigned_date (
  snapshot_id BIGINT NOT NULL REFERENCES analytics.snapshot_batches(snapshot_id) ON DELETE CASCADE,
  jurisdiction_label TEXT,
  role_category_label TEXT,
  region TEXT,
  location TEXT,
  task_name TEXT,
  work_type TEXT,
  reference_date DATE,
  total_wait_time_days_sum NUMERIC NOT NULL,
  assigned_task_count BIGINT NOT NULL
) PARTITION BY LIST (snapshot_id);

CREATE TABLE analytics.snapshot_overview_filter_facts (
  snapshot_id BIGINT NOT NULL REFERENCES analytics.snapshot_batches(snapshot_id) ON DELETE CASCADE,
  jurisdiction_label TEXT,
  role_category_label TEXT,
  region TEXT,
  location TEXT,
  task_name TEXT,
  work_type TEXT,
  row_count BIGINT NOT NULL
) PARTITION BY LIST (snapshot_id);

CREATE TABLE analytics.snapshot_outstanding_filter_facts (
  snapshot_id BIGINT NOT NULL REFERENCES analytics.snapshot_batches(snapshot_id) ON DELETE CASCADE,
  jurisdiction_label TEXT,
  role_category_label TEXT,
  region TEXT,
  location TEXT,
  task_name TEXT,
  work_type TEXT,
  row_count BIGINT NOT NULL
) PARTITION BY LIST (snapshot_id);

CREATE TABLE analytics.snapshot_completed_filter_facts (
  snapshot_id BIGINT NOT NULL REFERENCES analytics.snapshot_batches(snapshot_id) ON DELETE CASCADE,
  jurisdiction_label TEXT,
  role_category_label TEXT,
  region TEXT,
  location TEXT,
  task_name TEXT,
  work_type TEXT,
  row_count BIGINT NOT NULL
) PARTITION BY LIST (snapshot_id);

CREATE TABLE analytics.snapshot_user_filter_facts (
  snapshot_id BIGINT NOT NULL REFERENCES analytics.snapshot_batches(snapshot_id) ON DELETE CASCADE,
  jurisdiction_label TEXT,
  role_category_label TEXT,
  region TEXT,
  location TEXT,
  task_name TEXT,
  work_type TEXT,
  assignee TEXT,
  row_count BIGINT NOT NULL
) PARTITION BY LIST (snapshot_id);

-- Build analytics snapshots in detached tables, then publish in a short
-- attach transaction so parent-table reads continue during refresh.

DROP PROCEDURE IF EXISTS analytics.refresh_snapshot_filter_facts(BIGINT);
DROP PROCEDURE IF EXISTS analytics.create_snapshot_refresh_temp_tables();
DROP PROCEDURE IF EXISTS analytics.create_snapshot_detached_partitions(BIGINT);
DROP PROCEDURE IF EXISTS analytics.populate_snapshot_detached_tables(
  BIGINT,
  REGCLASS,
  REGCLASS,
  REGCLASS,
  REGCLASS,
  REGCLASS,
  REGCLASS,
  REGCLASS,
  REGCLASS,
  REGCLASS
);
DROP PROCEDURE IF EXISTS analytics.create_snapshot_core_indexes(
  BIGINT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
);
DROP PROCEDURE IF EXISTS analytics.create_snapshot_filter_indexes(
  BIGINT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
);
DROP FUNCTION IF EXISTS analytics.create_user_overview_completed_sort_indexes(BIGINT, TEXT);
DROP FUNCTION IF EXISTS analytics.snapshot_partition_catalog(BIGINT);

CREATE OR REPLACE FUNCTION analytics.snapshot_partition_catalog(p_snapshot_id BIGINT)
RETURNS TABLE (
  parent_table REGCLASS,
  partition_name TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    format('analytics.%I', base_table_name)::REGCLASS AS parent_table,
    format('%s_p_%s', base_table_name, p_snapshot_id) AS partition_name
  FROM unnest(
    ARRAY[
      'snapshot_open_task_rows',
      'snapshot_completed_task_rows',
      'snapshot_user_completed_facts',
      'snapshot_completed_dashboard_facts',
      'snapshot_outstanding_due_status_daily_facts',
      'snapshot_outstanding_created_assignment_daily_facts',
      'snapshot_open_due_daily_facts',
      'snapshot_task_event_daily_facts',
      'snapshot_wait_time_by_assigned_date',
      'snapshot_overview_filter_facts',
      'snapshot_outstanding_filter_facts',
      'snapshot_completed_filter_facts',
      'snapshot_user_filter_facts'
    ]::TEXT[]
  ) WITH ORDINALITY AS base_tables(base_table_name, ord)
  ORDER BY ord;
$$;

-- Internal helper for run_snapshot_refresh_batch(); the target tables are
-- newly created detached tables, so this procedure only inserts rows.
CREATE OR REPLACE PROCEDURE analytics.refresh_snapshot_filter_facts_from_tables(
  p_snapshot_id BIGINT,
  p_open_due_table REGCLASS,
  p_task_event_table REGCLASS,
  p_open_task_rows_table REGCLASS,
  p_completed_task_rows_table REGCLASS,
  p_overview_filter_table REGCLASS,
  p_outstanding_filter_table REGCLASS,
  p_completed_filter_table REGCLASS,
  p_user_filter_table REGCLASS
)
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format(
    $overview_filter$
    INSERT INTO %s (
      snapshot_id,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      row_count
    )
    SELECT
      $1,
      NULLIF(BTRIM(jurisdiction_label), '') AS jurisdiction_label,
      NULLIF(BTRIM(role_category_label), '') AS role_category_label,
      NULLIF(BTRIM(region), '') AS region,
      NULLIF(BTRIM(location), '') AS location,
      NULLIF(BTRIM(task_name), '') AS task_name,
      NULLIF(BTRIM(work_type), '') AS work_type,
      SUM(task_count)::BIGINT AS row_count
    FROM (
      SELECT
        jurisdiction_label,
        role_category_label,
        region,
        location,
        task_name,
        work_type,
        task_count
      FROM %s
      WHERE snapshot_id = $1

      UNION ALL

      SELECT
        jurisdiction_label,
        role_category_label,
        region,
        location,
        task_name,
        work_type,
        task_count
      FROM %s
      WHERE snapshot_id = $1
    ) overview_scope
    GROUP BY
      NULLIF(BTRIM(jurisdiction_label), ''),
      NULLIF(BTRIM(role_category_label), ''),
      NULLIF(BTRIM(region), ''),
      NULLIF(BTRIM(location), ''),
      NULLIF(BTRIM(task_name), ''),
      NULLIF(BTRIM(work_type), '')
    $overview_filter$,
    p_overview_filter_table,
    p_open_due_table,
    p_task_event_table
  )
  USING p_snapshot_id;

  EXECUTE format(
    $outstanding_filter$
    INSERT INTO %s (
      snapshot_id,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      row_count
    )
    SELECT
      $1,
      NULLIF(BTRIM(jurisdiction_label), '') AS jurisdiction_label,
      NULLIF(BTRIM(role_category_label), '') AS role_category_label,
      NULLIF(BTRIM(region), '') AS region,
      NULLIF(BTRIM(location), '') AS location,
      NULLIF(BTRIM(task_name), '') AS task_name,
      NULLIF(BTRIM(work_type), '') AS work_type,
      COUNT(*)::BIGINT AS row_count
    FROM %s
    WHERE snapshot_id = $1
    GROUP BY
      NULLIF(BTRIM(jurisdiction_label), ''),
      NULLIF(BTRIM(role_category_label), ''),
      NULLIF(BTRIM(region), ''),
      NULLIF(BTRIM(location), ''),
      NULLIF(BTRIM(task_name), ''),
      NULLIF(BTRIM(work_type), '')
    $outstanding_filter$,
    p_outstanding_filter_table,
    p_open_task_rows_table
  )
  USING p_snapshot_id;

  EXECUTE format(
    $completed_filter$
    INSERT INTO %s (
      snapshot_id,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      row_count
    )
    SELECT
      $1,
      NULLIF(BTRIM(jurisdiction_label), '') AS jurisdiction_label,
      NULLIF(BTRIM(role_category_label), '') AS role_category_label,
      NULLIF(BTRIM(region), '') AS region,
      NULLIF(BTRIM(location), '') AS location,
      NULLIF(BTRIM(task_name), '') AS task_name,
      NULLIF(BTRIM(work_type), '') AS work_type,
      COUNT(*)::BIGINT AS row_count
    FROM %s
    WHERE snapshot_id = $1
    GROUP BY
      NULLIF(BTRIM(jurisdiction_label), ''),
      NULLIF(BTRIM(role_category_label), ''),
      NULLIF(BTRIM(region), ''),
      NULLIF(BTRIM(location), ''),
      NULLIF(BTRIM(task_name), ''),
      NULLIF(BTRIM(work_type), '')
    $completed_filter$,
    p_completed_filter_table,
    p_completed_task_rows_table
  )
  USING p_snapshot_id;

  EXECUTE format(
    $user_filter$
    INSERT INTO %s (
      snapshot_id,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      assignee,
      row_count
    )
    SELECT
      $1,
      NULLIF(BTRIM(jurisdiction_label), '') AS jurisdiction_label,
      NULLIF(BTRIM(role_category_label), '') AS role_category_label,
      NULLIF(BTRIM(region), '') AS region,
      NULLIF(BTRIM(location), '') AS location,
      NULLIF(BTRIM(task_name), '') AS task_name,
      NULLIF(BTRIM(work_type), '') AS work_type,
      NULLIF(BTRIM(assignee), '') AS assignee,
      COUNT(*)::BIGINT AS row_count
    FROM (
      SELECT
        jurisdiction_label,
        role_category_label,
        region,
        location,
        task_name,
        work_type,
        assignee
      FROM %s
      WHERE snapshot_id = $1
        AND state = 'ASSIGNED'
        AND (role_category_label IS NULL OR UPPER(role_category_label) <> 'JUDICIAL')

      UNION ALL

      SELECT
        jurisdiction_label,
        role_category_label,
        region,
        location,
        task_name,
        work_type,
        assignee
      FROM %s
      WHERE snapshot_id = $1
        AND (role_category_label IS NULL OR UPPER(role_category_label) <> 'JUDICIAL')
    ) user_scope
    GROUP BY
      NULLIF(BTRIM(jurisdiction_label), ''),
      NULLIF(BTRIM(role_category_label), ''),
      NULLIF(BTRIM(region), ''),
      NULLIF(BTRIM(location), ''),
      NULLIF(BTRIM(task_name), ''),
      NULLIF(BTRIM(work_type), ''),
      NULLIF(BTRIM(assignee), '')
    $user_filter$,
    p_user_filter_table,
    p_open_task_rows_table,
    p_completed_task_rows_table
  )
  USING p_snapshot_id;
END;
$$;

CREATE OR REPLACE PROCEDURE analytics.cleanup_snapshot_partitions(p_snapshot_id BIGINT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_partition RECORD;
  v_child_table REGCLASS;
BEGIN
  BEGIN
    PERFORM set_config('lock_timeout', '500ms', TRUE);

    FOR v_partition IN
      SELECT *
      FROM analytics.snapshot_partition_catalog(p_snapshot_id)
    LOOP
      v_child_table := to_regclass(format('analytics.%I', v_partition.partition_name));

      IF v_child_table IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM pg_inherits
           WHERE inhparent = v_partition.parent_table
             AND inhrelid = v_child_table
         ) THEN
        EXECUTE format(
          'ALTER TABLE %s DETACH PARTITION %s',
          v_partition.parent_table,
          v_child_table
        );
      END IF;
    END LOOP;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Snapshot retention detach skipped for %: %', p_snapshot_id, SQLERRM;
      COMMIT;
      RETURN;
  END;

  COMMIT;

  BEGIN
    FOR v_partition IN
      SELECT *
      FROM analytics.snapshot_partition_catalog(p_snapshot_id)
    LOOP
      EXECUTE format('DROP TABLE IF EXISTS analytics.%I', v_partition.partition_name);
    END LOOP;

    DELETE FROM analytics.snapshot_batches
    WHERE snapshot_id = p_snapshot_id;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Snapshot retention drop skipped for %: %', p_snapshot_id, SQLERRM;
  END;

  COMMIT;
END;
$$;

CREATE OR REPLACE PROCEDURE analytics.cleanup_snapshot_retention()
LANGUAGE plpgsql
AS $$
DECLARE
  v_drop_snapshot_id BIGINT;
BEGIN
  FOR v_drop_snapshot_id IN
    WITH pinned AS (
      SELECT published_snapshot_id AS snapshot_id
      FROM analytics.snapshot_state
      WHERE singleton_id = TRUE
      UNION
      SELECT in_progress_snapshot_id AS snapshot_id
      FROM analytics.snapshot_state
      WHERE singleton_id = TRUE
    ),
    keep_succeeded AS (
      SELECT snapshot_id
      FROM analytics.snapshot_batches
      WHERE status = 'succeeded'
      ORDER BY snapshot_id DESC
      LIMIT 3
    )
    SELECT batches.snapshot_id
    FROM analytics.snapshot_batches batches
    WHERE batches.status = 'succeeded'
      AND batches.snapshot_id NOT IN (SELECT snapshot_id FROM keep_succeeded)
      AND batches.snapshot_id NOT IN (SELECT snapshot_id FROM pinned WHERE snapshot_id IS NOT NULL)
  LOOP
    CALL analytics.cleanup_snapshot_partitions(v_drop_snapshot_id);
  END LOOP;

  FOR v_drop_snapshot_id IN
    WITH keep_failed AS (
      SELECT snapshot_id
      FROM analytics.snapshot_batches
      WHERE status = 'failed'
      ORDER BY snapshot_id DESC
      LIMIT 100
    )
    SELECT batches.snapshot_id
    FROM analytics.snapshot_batches batches
    WHERE batches.status = 'failed'
      AND batches.snapshot_id NOT IN (SELECT snapshot_id FROM keep_failed)
  LOOP
    CALL analytics.cleanup_snapshot_partitions(v_drop_snapshot_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION analytics.create_user_overview_completed_sort_indexes(
  p_snapshot_id BIGINT,
  p_partition_name TEXT
)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON analytics.%I(created_date ASC) WHERE role_category_label IS NULL OR UPPER(role_category_label) <> ''JUDICIAL''',
    format('ix_sctr_p_%s_uo_completed_created_date', p_snapshot_id),
    p_partition_name
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON analytics.%I(first_assigned_date ASC) WHERE role_category_label IS NULL OR UPPER(role_category_label) <> ''JUDICIAL''',
    format('ix_sctr_p_%s_uo_completed_first_assigned_date', p_snapshot_id),
    p_partition_name
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON analytics.%I(due_date ASC) WHERE role_category_label IS NULL OR UPPER(role_category_label) <> ''JUDICIAL''',
    format('ix_sctr_p_%s_uo_completed_due_date', p_snapshot_id),
    p_partition_name
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON analytics.%I(handling_time_days ASC) WHERE role_category_label IS NULL OR UPPER(role_category_label) <> ''JUDICIAL''',
    format('ix_sctr_p_%s_uo_completed_handling_time_days', p_snapshot_id),
    p_partition_name
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON analytics.%I(assignee ASC) WHERE role_category_label IS NULL OR UPPER(role_category_label) <> ''JUDICIAL''',
    format('ix_sctr_p_%s_uo_completed_assignee', p_snapshot_id),
    p_partition_name
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON analytics.%I(task_name ASC) WHERE role_category_label IS NULL OR UPPER(role_category_label) <> ''JUDICIAL''',
    format('ix_sctr_p_%s_uo_completed_task_name', p_snapshot_id),
    p_partition_name
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON analytics.%I(location ASC) WHERE role_category_label IS NULL OR UPPER(role_category_label) <> ''JUDICIAL''',
    format('ix_sctr_p_%s_uo_completed_location', p_snapshot_id),
    p_partition_name
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON analytics.%I(((COALESCE(number_of_reassignments, 0) + 1)) ASC) WHERE role_category_label IS NULL OR UPPER(role_category_label) <> ''JUDICIAL''',
    format('ix_sctr_p_%s_uo_completed_total_assignments', p_snapshot_id),
    p_partition_name
  );
END;
$function$;

CREATE OR REPLACE PROCEDURE analytics.create_snapshot_refresh_temp_tables()
LANGUAGE plpgsql
AS $procedure$
BEGIN
  CREATE TEMP TABLE tmp_snapshot_source
  ON COMMIT DROP
  AS
  SELECT
    source.task_id,
    source.task_name,
    source.jurisdiction_label,
    source.case_type_label,
    source.role_category_label,
    source.case_id,
    source.region,
    source.location,
    source.state,
    source.termination_reason,
    LOWER(COALESCE(source.termination_reason, '')) AS termination_reason_lower,
    source.termination_process_label,
    source.outcome,
    source.work_type,
    source.is_within_sla,
    source.created_date,
    source.due_date,
    source.completed_date,
    source.first_assigned_date,
    source.major_priority,
    source.assignee,
    COALESCE(source.number_of_reassignments, 0) AS number_of_reassignments,
    CASE
      WHEN source.wait_time IS NULL THEN NULL
      ELSE (EXTRACT(EPOCH FROM source.wait_time) / EXTRACT(EPOCH FROM INTERVAL '1 day'))::double precision
    END AS wait_time_days,
    CASE
      WHEN source.handling_time IS NULL THEN NULL
      ELSE (EXTRACT(EPOCH FROM source.handling_time) / EXTRACT(EPOCH FROM INTERVAL '1 day'))::double precision
    END AS handling_time_days,
    CASE
      WHEN source.processing_time IS NULL THEN NULL
      ELSE (EXTRACT(EPOCH FROM source.processing_time) / EXTRACT(EPOCH FROM INTERVAL '1 day'))::double precision
    END AS processing_time_days,
    (
      COALESCE(
        EXTRACT(EPOCH FROM source.due_date_to_completed_diff_time) / EXTRACT(EPOCH FROM INTERVAL '1 day'),
        0
      ) * -1
    )::double precision AS days_beyond_due,
    CASE
      WHEN source.is_within_sla = 'Yes' THEN 1
      WHEN source.is_within_sla = 'No' THEN 2
      ELSE 3
    END AS within_due_sort_value
  FROM cft_task_db.reportable_task source;

  CREATE TEMP TABLE tmp_snapshot_fact_source
  ON COMMIT DROP
  AS
  SELECT
    task_name,
    jurisdiction_label,
    role_category_label,
    region,
    location,
    work_type,
    major_priority AS priority,
    termination_reason_lower,
    created_date,
    due_date,
    completed_date,
    handling_time_days,
    processing_time_days,
    CASE
      WHEN state = 'ASSIGNED' THEN 'Assigned'
      WHEN state IN ('UNASSIGNED', 'PENDING AUTO ASSIGN', 'UNCONFIGURED') THEN 'Unassigned'
      ELSE NULL
    END AS assignment_state,
    CASE
      WHEN termination_reason_lower = 'completed' THEN 'completed'
      WHEN state IN ('ASSIGNED', 'UNASSIGNED', 'PENDING AUTO ASSIGN', 'UNCONFIGURED') THEN 'open'
      ELSE 'other'
    END AS task_status,
    CASE
      WHEN is_within_sla = 'Yes' THEN TRUE
      WHEN is_within_sla = 'No' THEN FALSE
      ELSE NULL
    END AS sla_flag
  FROM tmp_snapshot_source;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE analytics.create_snapshot_detached_partitions(p_snapshot_id BIGINT)
LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_partition RECORD;
BEGIN
  FOR v_partition IN
    SELECT *
    FROM analytics.snapshot_partition_catalog(p_snapshot_id)
  LOOP
    EXECUTE format(
      'CREATE TABLE analytics.%I (LIKE %s INCLUDING DEFAULTS INCLUDING CONSTRAINTS)',
      v_partition.partition_name,
      v_partition.parent_table
    );
    EXECUTE format(
      'ALTER TABLE analytics.%I ADD CONSTRAINT %I CHECK (snapshot_id = %s)',
      v_partition.partition_name,
      format('ck_%s_snapshot_id', v_partition.partition_name),
      p_snapshot_id
    );
  END LOOP;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE analytics.populate_snapshot_detached_tables(
  p_snapshot_id BIGINT,
  p_open_rows_table REGCLASS,
  p_completed_rows_table REGCLASS,
  p_user_completed_facts_table REGCLASS,
  p_completed_dashboard_facts_table REGCLASS,
  p_outstanding_due_status_table REGCLASS,
  p_outstanding_created_assignment_table REGCLASS,
  p_open_due_table REGCLASS,
  p_task_event_table REGCLASS,
  p_wait_time_table REGCLASS
)
LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_prev_work_mem TEXT;
  v_prev_hash_mem_multiplier TEXT;
  v_prev_enable_sort TEXT;
BEGIN
  EXECUTE format(
    $open_rows_insert$
    INSERT INTO %s (
      snapshot_id,
      task_id,
      case_id,
      task_name,
      case_type_label,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      work_type,
      state,
      created_date,
      first_assigned_date,
      due_date,
      major_priority,
      assignee,
      number_of_reassignments
    )
    SELECT
      $1,
      task_id,
      case_id,
      task_name,
      case_type_label,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      work_type,
      state,
      created_date,
      first_assigned_date,
      due_date,
      major_priority,
      assignee,
      number_of_reassignments
    FROM tmp_snapshot_source
    WHERE state NOT IN ('COMPLETED', 'TERMINATED')
    $open_rows_insert$,
    p_open_rows_table
  )
  USING p_snapshot_id;

  EXECUTE format(
    $completed_rows_insert$
    INSERT INTO %s (
      snapshot_id,
      task_id,
      case_id,
      task_name,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      work_type,
      created_date,
      first_assigned_date,
      due_date,
      completed_date,
      handling_time_days,
      is_within_sla,
      termination_process_label,
      outcome,
      major_priority,
      assignee,
      number_of_reassignments,
      within_due_sort_value
    )
    SELECT
      $1,
      task_id,
      case_id,
      task_name,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      work_type,
      created_date,
      first_assigned_date,
      due_date,
      completed_date,
      handling_time_days,
      is_within_sla,
      termination_process_label,
      outcome,
      major_priority,
      assignee,
      number_of_reassignments,
      within_due_sort_value
    FROM tmp_snapshot_source
    WHERE termination_reason_lower = 'completed'
    $completed_rows_insert$,
    p_completed_rows_table
  )
  USING p_snapshot_id;

  EXECUTE format(
    $user_completed_insert$
    INSERT INTO %s (
      snapshot_id,
      assignee,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      completed_date,
      tasks,
      within_due,
      beyond_due,
      handling_time_sum,
      handling_time_count,
      days_beyond_sum,
      days_beyond_count
    )
    SELECT
      $1,
      assignee,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      completed_date,
      COUNT(*)::int AS tasks,
      SUM(CASE WHEN is_within_sla = 'Yes' THEN 1 ELSE 0 END)::int AS within_due,
      SUM(CASE WHEN is_within_sla = 'No' THEN 1 ELSE 0 END)::int AS beyond_due,
      COALESCE(SUM(COALESCE(handling_time_days, 0)), 0)::numeric AS handling_time_sum,
      COUNT(handling_time_days)::int AS handling_time_count,
      COALESCE(SUM(days_beyond_due), 0)::numeric AS days_beyond_sum,
      COUNT(*)::int AS days_beyond_count
    FROM tmp_snapshot_source
    WHERE completed_date IS NOT NULL
      AND termination_reason_lower = 'completed'
    GROUP BY
      assignee,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      completed_date
    $user_completed_insert$,
    p_user_completed_facts_table
  )
  USING p_snapshot_id;

  SELECT
    current_setting('work_mem'),
    current_setting('hash_mem_multiplier'),
    current_setting('enable_sort')
  INTO
    v_prev_work_mem,
    v_prev_hash_mem_multiplier,
    v_prev_enable_sort;

  -- Bias aggregate fact builds toward in-memory hash aggregate.
  PERFORM set_config('work_mem', '1GB', TRUE);
  PERFORM set_config('hash_mem_multiplier', '4', TRUE);
  PERFORM set_config('enable_sort', 'off', TRUE);

  EXECUTE format(
    $outstanding_due_status_insert$
    INSERT INTO %s (
      snapshot_id,
      due_date,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      open_task_count,
      completed_task_count
    )
    SELECT
      $1,
      due_date,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      SUM(CASE WHEN task_status = 'open' THEN 1 ELSE 0 END)::bigint AS open_task_count,
      SUM(CASE WHEN task_status = 'completed' THEN 1 ELSE 0 END)::bigint AS completed_task_count
    FROM tmp_snapshot_fact_source
    WHERE due_date IS NOT NULL
      AND task_status IN ('open', 'completed')
    GROUP BY
      due_date,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type
    $outstanding_due_status_insert$,
    p_outstanding_due_status_table
  )
  USING p_snapshot_id;

  EXECUTE format(
    $outstanding_created_assignment_insert$
    INSERT INTO %s (
      snapshot_id,
      reference_date,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      assignment_state,
      task_count
    )
    SELECT
      $1,
      created_date AS reference_date,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      assignment_state,
      COUNT(*)::bigint AS task_count
    FROM tmp_snapshot_fact_source
    WHERE created_date IS NOT NULL
      AND task_status = 'open'
    GROUP BY
      created_date,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      assignment_state
    $outstanding_created_assignment_insert$,
    p_outstanding_created_assignment_table
  )
  USING p_snapshot_id;

  EXECUTE format(
    $completed_dashboard_insert$
    INSERT INTO %s (
      snapshot_id,
      reference_date,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      total_task_count,
      within_task_count,
      handling_time_days_sum,
      handling_time_days_sum_squares,
      handling_time_days_count,
      processing_time_days_sum,
      processing_time_days_sum_squares,
      processing_time_days_count
    )
    SELECT
      $1,
      completed_date AS reference_date,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      COUNT(*)::bigint AS total_task_count,
      SUM(CASE WHEN sla_flag IS TRUE THEN 1 ELSE 0 END)::bigint AS within_task_count,
      COALESCE(SUM(COALESCE(handling_time_days, 0)), 0)::numeric AS handling_time_days_sum,
      COALESCE(
        SUM(COALESCE(handling_time_days, 0)::numeric * COALESCE(handling_time_days, 0)::numeric),
        0
      )::numeric AS handling_time_days_sum_squares,
      COUNT(handling_time_days)::bigint AS handling_time_days_count,
      COALESCE(SUM(COALESCE(processing_time_days, 0)), 0)::numeric AS processing_time_days_sum,
      COALESCE(
        SUM(COALESCE(processing_time_days, 0)::numeric * COALESCE(processing_time_days, 0)::numeric),
        0
      )::numeric AS processing_time_days_sum_squares,
      COUNT(processing_time_days)::bigint AS processing_time_days_count
    FROM tmp_snapshot_fact_source
    WHERE completed_date IS NOT NULL
      AND termination_reason_lower = 'completed'
    GROUP BY
      completed_date,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type
    $completed_dashboard_insert$,
    p_completed_dashboard_facts_table
  )
  USING p_snapshot_id;

  EXECUTE format(
    $open_due_insert$
    INSERT INTO %s (
      snapshot_id,
      due_date,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      priority,
      assignment_state,
      task_count
    )
    SELECT
      $1,
      due_date,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      priority,
      assignment_state,
      COUNT(*)::bigint AS task_count
    FROM tmp_snapshot_fact_source
    WHERE due_date IS NOT NULL
      AND task_status = 'open'
    GROUP BY
      due_date,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      priority,
      assignment_state
    $open_due_insert$,
    p_open_due_table
  )
  USING p_snapshot_id;

  EXECUTE format(
    $task_event_insert$
    INSERT INTO %s (
      snapshot_id,
      event_date,
      event_type,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      task_count
    )
    SELECT
      $1,
      created_date AS event_date,
      'created'::text AS event_type,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      COUNT(*)::bigint AS task_count
    FROM tmp_snapshot_fact_source
    WHERE created_date IS NOT NULL
    GROUP BY
      created_date,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type

    UNION ALL

    SELECT
      $1,
      completed_date AS event_date,
      'completed'::text AS event_type,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      COUNT(*)::bigint AS task_count
    FROM tmp_snapshot_fact_source
    WHERE completed_date IS NOT NULL
      AND termination_reason_lower = 'completed'
    GROUP BY
      completed_date,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type

    UNION ALL

    SELECT
      $1,
      completed_date AS event_date,
      'cancelled'::text AS event_type,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      COUNT(*)::bigint AS task_count
    FROM tmp_snapshot_fact_source
    WHERE completed_date IS NOT NULL
      AND termination_reason_lower = 'deleted'
    GROUP BY
      completed_date,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type
    $task_event_insert$,
    p_task_event_table
  )
  USING p_snapshot_id;

  -- Restore baseline refresh-session settings for subsequent statements.
  PERFORM set_config('enable_sort', v_prev_enable_sort, TRUE);
  PERFORM set_config('work_mem', v_prev_work_mem, TRUE);
  PERFORM set_config('hash_mem_multiplier', v_prev_hash_mem_multiplier, TRUE);

  EXECUTE format(
    $wait_time_insert$
    INSERT INTO %s (
      snapshot_id,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      reference_date,
      total_wait_time_days_sum,
      assigned_task_count
    )
    SELECT
      $1,
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      first_assigned_date AS reference_date,
      COALESCE(SUM(COALESCE(wait_time_days, 0)), 0)::numeric AS total_wait_time_days_sum,
      COUNT(*)::bigint AS assigned_task_count
    FROM tmp_snapshot_source
    WHERE state = 'ASSIGNED'
      AND wait_time_days IS NOT NULL
    GROUP BY
      jurisdiction_label,
      role_category_label,
      region,
      location,
      task_name,
      work_type,
      first_assigned_date
    $wait_time_insert$,
    p_wait_time_table
  )
  USING p_snapshot_id;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE analytics.create_snapshot_core_indexes(
  p_snapshot_id BIGINT,
  p_open_rows_partition_name TEXT,
  p_completed_rows_partition_name TEXT,
  p_user_completed_facts_partition_name TEXT,
  p_completed_dashboard_facts_partition_name TEXT,
  p_outstanding_due_status_partition_name TEXT,
  p_outstanding_created_assignment_partition_name TEXT,
  p_open_due_daily_partition_name TEXT,
  p_task_event_daily_partition_name TEXT,
  p_wait_time_partition_name TEXT
)
LANGUAGE plpgsql
AS $procedure$
BEGIN
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(jurisdiction_label, role_category_label, region, location, task_name, work_type)',
    format('ix_sotr_p_%s_slicers', p_snapshot_id),
    p_open_rows_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(state, created_date DESC)',
    format('ix_sotr_p_%s_state_created', p_snapshot_id),
    p_open_rows_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(created_date DESC NULLS LAST) WHERE state = ''ASSIGNED'' AND (role_category_label IS NULL OR UPPER(role_category_label) <> ''JUDICIAL'')',
    format('ix_sotr_p_%s_uo_assigned_default', p_snapshot_id),
    p_open_rows_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(state, assignee, created_date DESC) WHERE assignee IS NOT NULL',
    format('ix_sotr_p_%s_state_assignee_created', p_snapshot_id),
    p_open_rows_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(due_date)',
    format('ix_sotr_p_%s_due_date', p_snapshot_id),
    p_open_rows_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(case_id)',
    format('ix_sotr_p_%s_case_id', p_snapshot_id),
    p_open_rows_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(UPPER(role_category_label))',
    format('ix_sotr_p_%s_upper_role_category', p_snapshot_id),
    p_open_rows_partition_name
  );

  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(jurisdiction_label, role_category_label, region, location, task_name, work_type)',
    format('ix_sctr_p_%s_slicers', p_snapshot_id),
    p_completed_rows_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(completed_date DESC)',
    format('ix_sctr_p_%s_completed_date', p_snapshot_id),
    p_completed_rows_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(completed_date DESC NULLS LAST) WHERE role_category_label IS NULL OR UPPER(role_category_label) <> ''JUDICIAL''',
    format('ix_sctr_p_%s_uo_completed_default', p_snapshot_id),
    p_completed_rows_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(assignee, completed_date DESC) WHERE assignee IS NOT NULL',
    format('ix_sctr_p_%s_assignee_completed', p_snapshot_id),
    p_completed_rows_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(case_id, completed_date DESC)',
    format('ix_sctr_p_%s_case_id_completed', p_snapshot_id),
    p_completed_rows_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(within_due_sort_value, completed_date)',
    format('ix_sctr_p_%s_within_due_sort', p_snapshot_id),
    p_completed_rows_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(UPPER(role_category_label))',
    format('ix_sctr_p_%s_upper_role_category', p_snapshot_id),
    p_completed_rows_partition_name
  );
  PERFORM analytics.create_user_overview_completed_sort_indexes(
    p_snapshot_id,
    p_completed_rows_partition_name
  );

  EXECUTE format(
    'CREATE UNIQUE INDEX %I ON analytics.%I(assignee, jurisdiction_label, role_category_label, region, location, task_name, work_type, completed_date)',
    format('ux_sucf_p_%s_key', p_snapshot_id),
    p_user_completed_facts_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(assignee, completed_date DESC)',
    format('ix_sucf_p_%s_assignee_completed', p_snapshot_id),
    p_user_completed_facts_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(task_name)',
    format('ix_sucf_p_%s_task_name', p_snapshot_id),
    p_user_completed_facts_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(jurisdiction_label, role_category_label, region, location, task_name, work_type)',
    format('ix_sucf_p_%s_slicers', p_snapshot_id),
    p_user_completed_facts_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(completed_date)',
    format('ix_sucf_p_%s_completed_date', p_snapshot_id),
    p_user_completed_facts_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(UPPER(role_category_label))',
    format('ix_sucf_p_%s_upper_role_category', p_snapshot_id),
    p_user_completed_facts_partition_name
  );

  EXECUTE format(
    'CREATE UNIQUE INDEX %I ON analytics.%I(reference_date, jurisdiction_label, role_category_label, region, location, task_name, work_type)',
    format('ux_scdf_p_%s_key', p_snapshot_id),
    p_completed_dashboard_facts_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(reference_date)',
    format('ix_scdf_p_%s_reference_date', p_snapshot_id),
    p_completed_dashboard_facts_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(jurisdiction_label, role_category_label, region, location, task_name, work_type)',
    format('ix_scdf_p_%s_slicers', p_snapshot_id),
    p_completed_dashboard_facts_partition_name
  );

  EXECUTE format(
    'CREATE UNIQUE INDEX %I ON analytics.%I(due_date, jurisdiction_label, role_category_label, region, location, task_name, work_type)',
    format('ux_sodsf_p_%s_key', p_snapshot_id),
    p_outstanding_due_status_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(due_date) INCLUDE (open_task_count, completed_task_count)',
    format('ix_sodsf_p_%s_due_date', p_snapshot_id),
    p_outstanding_due_status_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(jurisdiction_label, role_category_label, region, location, task_name, work_type)',
    format('ix_sodsf_p_%s_slicers', p_snapshot_id),
    p_outstanding_due_status_partition_name
  );

  EXECUTE format(
    'CREATE UNIQUE INDEX %I ON analytics.%I(reference_date, jurisdiction_label, role_category_label, region, location, task_name, work_type, assignment_state)',
    format('ux_socaf_p_%s_key', p_snapshot_id),
    p_outstanding_created_assignment_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(reference_date)',
    format('ix_socaf_p_%s_ref_date', p_snapshot_id),
    p_outstanding_created_assignment_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(jurisdiction_label, role_category_label, region, location, task_name, work_type, assignment_state)',
    format('ix_socaf_p_%s_slicers', p_snapshot_id),
    p_outstanding_created_assignment_partition_name
  );

  EXECUTE format(
    'CREATE UNIQUE INDEX %I ON analytics.%I(due_date, jurisdiction_label, role_category_label, region, location, task_name, work_type, priority, assignment_state)',
    format('ux_soddf_p_%s_key', p_snapshot_id),
    p_open_due_daily_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(jurisdiction_label, role_category_label, region, location, task_name, work_type)',
    format('ix_soddf_p_%s_slicers', p_snapshot_id),
    p_open_due_daily_partition_name
  );

  EXECUTE format(
    'CREATE UNIQUE INDEX %I ON analytics.%I(event_date, event_type, jurisdiction_label, role_category_label, region, location, task_name, work_type)',
    format('ux_stedf_p_%s_key', p_snapshot_id),
    p_task_event_daily_partition_name
  );

  EXECUTE format(
    'CREATE UNIQUE INDEX %I ON analytics.%I(jurisdiction_label, role_category_label, region, location, task_name, work_type, reference_date)',
    format('ux_swt_p_%s_key', p_snapshot_id),
    p_wait_time_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(jurisdiction_label, role_category_label, region, location, task_name, work_type)',
    format('ix_swt_p_%s_slicers', p_snapshot_id),
    p_wait_time_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(reference_date)',
    format('ix_swt_p_%s_reference_date', p_snapshot_id),
    p_wait_time_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(UPPER(role_category_label))',
    format('ix_swt_p_%s_upper_role_category', p_snapshot_id),
    p_wait_time_partition_name
  );
END;
$procedure$;

CREATE OR REPLACE PROCEDURE analytics.create_snapshot_filter_indexes(
  p_snapshot_id BIGINT,
  p_overview_filter_partition_name TEXT,
  p_outstanding_filter_partition_name TEXT,
  p_completed_filter_partition_name TEXT,
  p_user_filter_partition_name TEXT
)
LANGUAGE plpgsql
AS $procedure$
BEGIN
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(jurisdiction_label, role_category_label, region, location, task_name, work_type)',
    format('ix_soff_p_%s_slicers', p_snapshot_id),
    p_overview_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(jurisdiction_label)',
    format('ix_soff_p_%s_service', p_snapshot_id),
    p_overview_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(role_category_label)',
    format('ix_soff_p_%s_role_category', p_snapshot_id),
    p_overview_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(region)',
    format('ix_soff_p_%s_region', p_snapshot_id),
    p_overview_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(location)',
    format('ix_soff_p_%s_location', p_snapshot_id),
    p_overview_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(task_name)',
    format('ix_soff_p_%s_task_name', p_snapshot_id),
    p_overview_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(work_type)',
    format('ix_soff_p_%s_work_type', p_snapshot_id),
    p_overview_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(UPPER(role_category_label))',
    format('ix_soff_p_%s_upper_role_category', p_snapshot_id),
    p_overview_filter_partition_name
  );

  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(jurisdiction_label, role_category_label, region, location, task_name, work_type)',
    format('ix_sotff_p_%s_slicers', p_snapshot_id),
    p_outstanding_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(jurisdiction_label)',
    format('ix_sotff_p_%s_service', p_snapshot_id),
    p_outstanding_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(role_category_label)',
    format('ix_sotff_p_%s_role_category', p_snapshot_id),
    p_outstanding_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(region)',
    format('ix_sotff_p_%s_region', p_snapshot_id),
    p_outstanding_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(location)',
    format('ix_sotff_p_%s_location', p_snapshot_id),
    p_outstanding_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(task_name)',
    format('ix_sotff_p_%s_task_name', p_snapshot_id),
    p_outstanding_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(work_type)',
    format('ix_sotff_p_%s_work_type', p_snapshot_id),
    p_outstanding_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(UPPER(role_category_label))',
    format('ix_sotff_p_%s_upper_role_category', p_snapshot_id),
    p_outstanding_filter_partition_name
  );

  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(jurisdiction_label, role_category_label, region, location, task_name, work_type)',
    format('ix_scff_p_%s_slicers', p_snapshot_id),
    p_completed_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(jurisdiction_label)',
    format('ix_scff_p_%s_service', p_snapshot_id),
    p_completed_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(role_category_label)',
    format('ix_scff_p_%s_role_category', p_snapshot_id),
    p_completed_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(region)',
    format('ix_scff_p_%s_region', p_snapshot_id),
    p_completed_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(location)',
    format('ix_scff_p_%s_location', p_snapshot_id),
    p_completed_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(task_name)',
    format('ix_scff_p_%s_task_name', p_snapshot_id),
    p_completed_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(work_type)',
    format('ix_scff_p_%s_work_type', p_snapshot_id),
    p_completed_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(UPPER(role_category_label))',
    format('ix_scff_p_%s_upper_role_category', p_snapshot_id),
    p_completed_filter_partition_name
  );

  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(jurisdiction_label, role_category_label, region, location, task_name, work_type, assignee)',
    format('ix_suff_p_%s_slicers', p_snapshot_id),
    p_user_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(jurisdiction_label)',
    format('ix_suff_p_%s_service', p_snapshot_id),
    p_user_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(role_category_label)',
    format('ix_suff_p_%s_role_category', p_snapshot_id),
    p_user_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(region)',
    format('ix_suff_p_%s_region', p_snapshot_id),
    p_user_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(location)',
    format('ix_suff_p_%s_location', p_snapshot_id),
    p_user_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(task_name)',
    format('ix_suff_p_%s_task_name', p_snapshot_id),
    p_user_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(work_type)',
    format('ix_suff_p_%s_work_type', p_snapshot_id),
    p_user_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(assignee)',
    format('ix_suff_p_%s_assignee', p_snapshot_id),
    p_user_filter_partition_name
  );
  EXECUTE format(
    'CREATE INDEX %I ON analytics.%I(UPPER(role_category_label))',
    format('ix_suff_p_%s_upper_role_category', p_snapshot_id),
    p_user_filter_partition_name
  );
END;
$procedure$;

CREATE OR REPLACE PROCEDURE analytics.run_snapshot_refresh_batch()
LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_snapshot_id BIGINT;
  v_lock_key BIGINT := hashtext('analytics_run_snapshot_refresh_batch_lock');
  v_batch_failed BOOLEAN := FALSE;
  v_batch_error_message TEXT;
  v_open_rows_partition_name TEXT;
  v_completed_rows_partition_name TEXT;
  v_user_completed_facts_partition_name TEXT;
  v_completed_dashboard_facts_partition_name TEXT;
  v_outstanding_due_status_partition_name TEXT;
  v_outstanding_created_assignment_partition_name TEXT;
  v_open_due_daily_partition_name TEXT;
  v_task_event_daily_partition_name TEXT;
  v_wait_time_partition_name TEXT;
  v_overview_filter_partition_name TEXT;
  v_outstanding_filter_partition_name TEXT;
  v_completed_filter_partition_name TEXT;
  v_user_filter_partition_name TEXT;
  v_partition RECORD;
  v_prev_work_mem TEXT;
  v_prev_hash_mem_multiplier TEXT;
  v_prev_enable_sort TEXT;
BEGIN
  IF NOT pg_try_advisory_lock(v_lock_key) THEN
    RAISE NOTICE 'Analytics snapshot batch already running; skipping trigger.';
    RETURN;
  END IF;

  BEGIN
    v_snapshot_id := nextval('analytics.snapshot_id_seq');

    INSERT INTO analytics.snapshot_batches (
      snapshot_id,
      status
    )
    VALUES (
      v_snapshot_id,
      'running'
    );

    UPDATE analytics.snapshot_state
    SET in_progress_snapshot_id = v_snapshot_id
    WHERE singleton_id = TRUE;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_advisory_unlock(v_lock_key);
      RAISE;
  END;

  COMMIT;

  BEGIN
    -- Keep refresh staging and index builds in memory where possible.
    PERFORM set_config('work_mem', '256MB', TRUE);
    PERFORM set_config('maintenance_work_mem', '1GB', TRUE);

    CALL analytics.create_snapshot_refresh_temp_tables();

    v_open_rows_partition_name := format('snapshot_open_task_rows_p_%s', v_snapshot_id);
    v_completed_rows_partition_name := format('snapshot_completed_task_rows_p_%s', v_snapshot_id);
    v_user_completed_facts_partition_name := format('snapshot_user_completed_facts_p_%s', v_snapshot_id);
    v_completed_dashboard_facts_partition_name := format('snapshot_completed_dashboard_facts_p_%s', v_snapshot_id);
    v_outstanding_due_status_partition_name := format('snapshot_outstanding_due_status_daily_facts_p_%s', v_snapshot_id);
    v_outstanding_created_assignment_partition_name := format(
      'snapshot_outstanding_created_assignment_daily_facts_p_%s',
      v_snapshot_id
    );
    v_open_due_daily_partition_name := format('snapshot_open_due_daily_facts_p_%s', v_snapshot_id);
    v_task_event_daily_partition_name := format('snapshot_task_event_daily_facts_p_%s', v_snapshot_id);
    v_wait_time_partition_name := format('snapshot_wait_time_by_assigned_date_p_%s', v_snapshot_id);
    v_overview_filter_partition_name := format('snapshot_overview_filter_facts_p_%s', v_snapshot_id);
    v_outstanding_filter_partition_name := format('snapshot_outstanding_filter_facts_p_%s', v_snapshot_id);
    v_completed_filter_partition_name := format('snapshot_completed_filter_facts_p_%s', v_snapshot_id);
    v_user_filter_partition_name := format('snapshot_user_filter_facts_p_%s', v_snapshot_id);

    CALL analytics.create_snapshot_detached_partitions(v_snapshot_id);

    CALL analytics.populate_snapshot_detached_tables(
      v_snapshot_id,
      format('analytics.%I', v_open_rows_partition_name)::REGCLASS,
      format('analytics.%I', v_completed_rows_partition_name)::REGCLASS,
      format('analytics.%I', v_user_completed_facts_partition_name)::REGCLASS,
      format('analytics.%I', v_completed_dashboard_facts_partition_name)::REGCLASS,
      format('analytics.%I', v_outstanding_due_status_partition_name)::REGCLASS,
      format('analytics.%I', v_outstanding_created_assignment_partition_name)::REGCLASS,
      format('analytics.%I', v_open_due_daily_partition_name)::REGCLASS,
      format('analytics.%I', v_task_event_daily_partition_name)::REGCLASS,
      format('analytics.%I', v_wait_time_partition_name)::REGCLASS
    );

    CALL analytics.create_snapshot_core_indexes(
      v_snapshot_id,
      v_open_rows_partition_name,
      v_completed_rows_partition_name,
      v_user_completed_facts_partition_name,
      v_completed_dashboard_facts_partition_name,
      v_outstanding_due_status_partition_name,
      v_outstanding_created_assignment_partition_name,
      v_open_due_daily_partition_name,
      v_task_event_daily_partition_name,
      v_wait_time_partition_name
    );

    -- Bias facet aggregation toward in-memory hash aggregate.
    SELECT
      current_setting('work_mem'),
      current_setting('hash_mem_multiplier'),
      current_setting('enable_sort')
    INTO
      v_prev_work_mem,
      v_prev_hash_mem_multiplier,
      v_prev_enable_sort;

    PERFORM set_config('work_mem', '1GB', TRUE);
    PERFORM set_config('hash_mem_multiplier', '4', TRUE);
    PERFORM set_config('enable_sort', 'off', TRUE);

    CALL analytics.refresh_snapshot_filter_facts_from_tables(
      v_snapshot_id,
      format('analytics.%I', v_open_due_daily_partition_name)::REGCLASS,
      format('analytics.%I', v_task_event_daily_partition_name)::REGCLASS,
      format('analytics.%I', v_open_rows_partition_name)::REGCLASS,
      format('analytics.%I', v_completed_rows_partition_name)::REGCLASS,
      format('analytics.%I', v_overview_filter_partition_name)::REGCLASS,
      format('analytics.%I', v_outstanding_filter_partition_name)::REGCLASS,
      format('analytics.%I', v_completed_filter_partition_name)::REGCLASS,
      format('analytics.%I', v_user_filter_partition_name)::REGCLASS
    );

    -- Restore baseline refresh-session settings for index creation and cleanup.
    PERFORM set_config('enable_sort', v_prev_enable_sort, TRUE);
    PERFORM set_config('work_mem', v_prev_work_mem, TRUE);
    PERFORM set_config('hash_mem_multiplier', v_prev_hash_mem_multiplier, TRUE);

    CALL analytics.create_snapshot_filter_indexes(
      v_snapshot_id,
      v_overview_filter_partition_name,
      v_outstanding_filter_partition_name,
      v_completed_filter_partition_name,
      v_user_filter_partition_name
    );

    FOR v_partition IN
      SELECT *
      FROM analytics.snapshot_partition_catalog(v_snapshot_id)
    LOOP
      EXECUTE format('ANALYZE analytics.%I', v_partition.partition_name);
    END LOOP;
  EXCEPTION
    WHEN OTHERS THEN
      v_batch_failed := TRUE;
      v_batch_error_message := SQLERRM;
  END;

  IF v_batch_failed THEN
    UPDATE analytics.snapshot_batches
    SET status = 'failed', completed_at = clock_timestamp(), error_message = v_batch_error_message
    WHERE snapshot_id = v_snapshot_id;

    UPDATE analytics.snapshot_state
    SET in_progress_snapshot_id = NULL
    WHERE singleton_id = TRUE AND in_progress_snapshot_id = v_snapshot_id;

    COMMIT;
    PERFORM pg_advisory_unlock(v_lock_key);
    RAISE EXCEPTION 'Analytics snapshot batch % failed: %', v_snapshot_id, v_batch_error_message;
  END IF;

  COMMIT;

  v_batch_failed := FALSE;
  v_batch_error_message := NULL;

  BEGIN
    FOR v_partition IN
      SELECT *
      FROM analytics.snapshot_partition_catalog(v_snapshot_id)
    LOOP
      EXECUTE format(
        'ALTER TABLE %s ATTACH PARTITION analytics.%I FOR VALUES IN (%s)',
        v_partition.parent_table,
        v_partition.partition_name,
        v_snapshot_id
      );
    END LOOP;

    UPDATE analytics.snapshot_batches
    SET status = 'succeeded', completed_at = clock_timestamp(), error_message = NULL
    WHERE snapshot_id = v_snapshot_id;

    UPDATE analytics.snapshot_state
    SET published_snapshot_id = v_snapshot_id,
        published_at = clock_timestamp(),
        in_progress_snapshot_id = NULL
    WHERE singleton_id = TRUE;
  EXCEPTION
    WHEN OTHERS THEN
      v_batch_failed := TRUE;
      v_batch_error_message := SQLERRM;
  END;

  IF v_batch_failed THEN
    FOR v_partition IN
      SELECT *
      FROM analytics.snapshot_partition_catalog(v_snapshot_id)
    LOOP
      BEGIN
        EXECUTE format('DROP TABLE IF EXISTS analytics.%I', v_partition.partition_name);
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING 'Failed to drop detached snapshot table % after failed publish of %: %',
            v_partition.partition_name,
            v_snapshot_id,
            SQLERRM;
      END;
    END LOOP;

    UPDATE analytics.snapshot_batches
    SET status = 'failed', completed_at = clock_timestamp(), error_message = v_batch_error_message
    WHERE snapshot_id = v_snapshot_id;

    UPDATE analytics.snapshot_state
    SET in_progress_snapshot_id = NULL
    WHERE singleton_id = TRUE AND in_progress_snapshot_id = v_snapshot_id;

    COMMIT;
    PERFORM pg_advisory_unlock(v_lock_key);
    RAISE EXCEPTION 'Analytics snapshot batch % failed during publish: %', v_snapshot_id, v_batch_error_message;
  END IF;

  COMMIT;

  CALL analytics.cleanup_snapshot_retention();

  PERFORM pg_advisory_unlock(v_lock_key);
END;
$procedure$;
-- Snapshot refresh scheduling is registered by application startup when
-- analytics.snapshotRefreshCronBootstrap.enabled=true. Startup registration
-- uses cron.schedule_in_database(...) from the configured cron metadata
-- database (default postgres) targeting this analytics database.
