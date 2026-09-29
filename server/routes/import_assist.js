/**
 * Column matching for the Import Wizard, using TypeSafe.
 *
 * A customer's spreadsheet rarely uses our column names: greytHR exports say
 * "Employee No", eSSL says "EmpCode", someone's own sheet says "Staff ID". The
 * wizard matches exact names and a synonym list in code first; this route is
 * the optional second pass for whatever is still unmatched.
 *
 * It selects, it never generates: for each field we need, one Choice question
 * picks which of the file's own columns holds it, or none. Code then applies
 * only confident answers and settles conflicts, so whatever comes back is a
 * column that exists in the file.
 *
 * Off unless TYPESAFE_API_KEY is set. What leaves the server is the column
 * headers and at most two short sample values per column, only when a user
 * presses the button.
 */

const express = require('express');
const router = express.Router();

const MAX_COLUMNS = 40;
const MAX_SAMPLE_LEN = 40;
// Below this the suggestion is shown but not applied; the user picks.
const AUTO_APPLY_CONFIDENCE = 0.7;

const available = () => Boolean(process.env.TYPESAFE_API_KEY);

router.get('/import/assist-status', (req, res) => {
    res.json({ available: available() });
});

router.post('/import/suggest-mapping', async (req, res) => {
    if (!available()) {
        return res.status(409).json({ error: 'Column suggestions are not configured on this server (TYPESAFE_API_KEY is not set).' });
    }
    const { kind, targets, columns } = req.body || {};
    if (!Array.isArray(targets) || targets.length === 0 || !Array.isArray(columns) || columns.length === 0) {
        return res.status(400).json({ error: 'targets and columns are required' });
    }

    const cols = columns.slice(0, MAX_COLUMNS).map((c, i) => ({
        label: `col_${i}`,
        header: String(c.header ?? '').slice(0, 80),
        samples: (Array.isArray(c.samples) ? c.samples : [])
            .map(v => String(v ?? '').trim())
            .filter(Boolean)
            .slice(0, 2)
            .map(v => v.slice(0, MAX_SAMPLE_LEN))
    }));

    // Labels must be self-describing: the model sees criteria, not our IDs.
    const criteria = {};
    for (const c of cols) {
        criteria[c.label] = c.samples.length
            ? `The column headed "${c.header}" (values like ${c.samples.map(v => `"${v}"`).join(', ')})`
            : `The column headed "${c.header}" (no sample values)`;
    }
    criteria.none = 'None of the columns in the file holds this field';

    try {
        const { TypeSafeClient, choice } = require('@typesafe-ai/sdk');
        const client = new TypeSafeClient({ timeout: 15000 });

        const questions = {};
        const valid = targets.filter(t => t && typeof t.key === 'string' && /^\w+$/.test(t.key)).slice(0, 20);
        for (const t of valid) {
            questions[t.key] = choice(
                `An attendance system is importing a spreadsheet of ${String(kind || 'records').slice(0, 60)}. ` +
                `Which column in \`file_columns\` holds ${String(t.meaning || t.key).slice(0, 160)}? ` +
                'Judge by both the header and the sample values. If no column holds it, choose none.',
                criteria
            );
        }
        if (Object.keys(questions).length === 0) {
            return res.status(400).json({ error: 'No valid targets' });
        }

        const { answers } = await client.systemOne({
            state: { file_columns: cols.map(({ header, samples }) => ({ header, samples })) },
            questions
        });

        // One column can feed one field. When two fields claim the same column,
        // the stronger claim keeps it and the other is left for the user.
        const byLabel = Object.fromEntries(cols.map(c => [c.label, c.header]));
        const picks = Object.entries(answers)
            .map(([key, a]) => ({ key, label: a.choice, confidence: a.confidence, p: a.probabilities?.[a.choice] ?? 0 }))
            .filter(x => x.label && x.label !== 'none' && byLabel[x.label] !== undefined)
            .sort((a, b) => b.p - a.p);
        const taken = new Set();
        const suggestions = {};
        for (const x of picks) {
            if (taken.has(x.label)) continue;
            taken.add(x.label);
            suggestions[x.key] = {
                column: byLabel[x.label],
                confidence: Number(x.confidence.toFixed(3)),
                apply: x.confidence >= AUTO_APPLY_CONFIDENCE
            };
        }
        res.json({ suggestions });
    } catch (err) {
        // 424, not 5xx: the app hides 5xx messages, and this one is worth reading.
        const status = 424;
        res.status(status).json({ error: `Column suggestion failed: ${err.message}` });
    }
});

module.exports = router;
