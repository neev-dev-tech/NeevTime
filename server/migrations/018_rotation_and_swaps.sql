-- Rotation patterns and shift swaps — step 4 of the shift/leave/reports phase.
--
-- A rotation is a repeating sequence of shifts (week A nights, week B days)
-- that GENERATES employee_schedules rows in advance. Generation, not
-- interpretation: the attendance engine keeps reading employee_schedules and
-- needs no knowledge of rotations, the Schedule screens show exactly what will
-- be worked, and deleting a rotation stops future generation without
-- rewriting history.

CREATE TABLE IF NOT EXISTS shift_rotations (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(140) NOT NULL,
    -- Ordered shift ids, one per period; NULL means a week off pattern slot.
    shift_sequence INTEGER[] NOT NULL,
    -- Days each slot lasts. 7 = weekly rotation, 1 = daily.
    period_days    INTEGER NOT NULL DEFAULT 7,
    anchor_date    DATE NOT NULL,
    is_active      BOOLEAN DEFAULT true,
    created_at     TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_rotations (
    id           SERIAL PRIMARY KEY,
    employee_id  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    rotation_id  INTEGER NOT NULL REFERENCES shift_rotations(id) ON DELETE CASCADE,
    -- Offsets stagger crews: offset 1 starts one slot later, so two crews on
    -- the same two-slot pattern cover both shifts every week.
    slot_offset  INTEGER NOT NULL DEFAULT 0,
    starts_on    DATE NOT NULL,
    ends_on      DATE,
    UNIQUE (employee_id, rotation_id, starts_on)
);

-- A swap is a request: two people, one date each, approved like leave is.
CREATE TABLE IF NOT EXISTS shift_swaps (
    id                 SERIAL PRIMARY KEY,
    requester_code     VARCHAR(50) NOT NULL REFERENCES employees(employee_code),
    counterpart_code   VARCHAR(50) NOT NULL REFERENCES employees(employee_code),
    requester_date     DATE NOT NULL,
    counterpart_date   DATE NOT NULL,
    reason             TEXT,
    status             VARCHAR(20) DEFAULT 'pending',
    -- The counterpart agrees before any approver sees it. A swap is first an
    -- agreement between two people; management approves the agreement.
    counterpart_accepted BOOLEAN,
    approved_via       VARCHAR(30),
    approver_employee_code VARCHAR(50),
    approved_at        TIMESTAMP,
    created_at         TIMESTAMP DEFAULT now()
);

DO $attach$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_row_change') THEN
        DROP TRIGGER IF EXISTS audit_shift_rotations ON shift_rotations;
        CREATE TRIGGER audit_shift_rotations
            AFTER INSERT OR UPDATE OR DELETE ON shift_rotations
            FOR EACH ROW EXECUTE FUNCTION audit_row_change();
        DROP TRIGGER IF EXISTS audit_shift_swaps ON shift_swaps;
        CREATE TRIGGER audit_shift_swaps
            AFTER INSERT OR UPDATE OR DELETE ON shift_swaps
            FOR EACH ROW EXECUTE FUNCTION audit_row_change();
    END IF;
END;
$attach$;
