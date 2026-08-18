-- The documents table, on databases that predate the schema file — same
-- lesson as audit_logs, the shift tables and the leave tables. The Employee
-- Document screen has answered 500 on every install whose database never
-- loaded 000_schema.sql, the pilot included. Shaped to what the routes
-- actually read and write (personnel_expansion.js), which is the schema
-- file's shape.
CREATE TABLE IF NOT EXISTS employee_docs (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) REFERENCES employees(employee_code) ON DELETE CASCADE,
    doc_name VARCHAR(100) NOT NULL,
    file_path TEXT,
    file_type VARCHAR(100),
    uploaded_at TIMESTAMP DEFAULT now()
);
