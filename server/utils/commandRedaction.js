/**
 * Device commands as they may be shown, not as they are sent.
 *
 * A queued command carries what the reader needs: `Passwd=` is the employee's
 * device PIN in plain text and `Tmp=` is a base64 fingerprint or face
 * template. The command list, the dead-letter queue and an employee's command
 * history all returned that text to any signed-in role. Screens only need to
 * know which command it was, for whom and how it went, so the PIN is masked
 * and the template is replaced by its length. The stored command is
 * untouched — the reader still receives the real one.
 */

const redactCommandText = (text) => {
    if (typeof text !== 'string') return text;
    return text
        .replace(/(\bPasswd=)[^\t\r\n]*/g, (m, key) => (m.length > key.length ? `${key}••••` : m))
        .replace(/(\bTmp=)([^\t\r\n]*)/g, (m, key, tmpl) => (tmpl ? `${key}[template, ${tmpl.length} chars]` : m));
};

const redactCommand = (row) => (row && typeof row === 'object' && 'command' in row
    ? { ...row, command: redactCommandText(row.command) }
    : row);

const redactCommands = (rows) => (rows || []).map(redactCommand);

module.exports = { redactCommandText, redactCommand, redactCommands };
