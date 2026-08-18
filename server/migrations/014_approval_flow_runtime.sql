-- Make the approval workflow builder real: running state and per-step record.
--
-- Role / Flow / Node pages have existed for months and routed nothing — but
-- not for the reason first assumed. The builder was MORE complete than it
-- looked: flow_nodes already stored each flow's ordered steps and the Flow
-- page already edited them. What never existed was a runtime reading any of
-- it at decision time. The first draft of this migration added a duplicate
-- steps table before finding flow_nodes; the runtime reads flow_nodes, and
-- this migration adds only what genuinely did not exist: where a request
-- stands, and a record of each step's decision.

-- Where a request stands in its flow. NULL flow_id = the default chain.
ALTER TABLE leaves
    ADD COLUMN IF NOT EXISTS flow_id INTEGER,
    ADD COLUMN IF NOT EXISTS current_step INTEGER;
ALTER TABLE attendance_regularizations
    ADD COLUMN IF NOT EXISTS flow_id INTEGER,
    ADD COLUMN IF NOT EXISTS current_step INTEGER;

-- Every step's decision, kept. approved_via on the request records only the
-- final signature; a two-step flow's first approval would otherwise vanish,
-- and "who signed off at level 1" is exactly what a dispute asks.
CREATE TABLE IF NOT EXISTS approval_actions (
    id            SERIAL PRIMARY KEY,
    request_type  VARCHAR(30) NOT NULL,
    request_id    INTEGER NOT NULL,
    step_no       INTEGER NOT NULL,
    decided_by    VARCHAR(50) NOT NULL,
    decision      VARCHAR(20) NOT NULL,
    comment       TEXT,
    decided_at    TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_actions_request
    ON approval_actions (request_type, request_id);

