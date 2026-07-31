/**
 * Leave balance arithmetic, kept separate from the route so it can be tested
 * without a database.
 *
 * This is the logic that decides whether an employee's used-days move, and by
 * how much, when an application changes status. It got this its own module
 * after a bug where approving twice deducted twice — the kind of error that
 * shows up as a wrong balance months later, with no trace of how it happened.
 */

const APPROVED = 'Approved';

/**
 * Work out what a status change should do to the leave balance.
 *
 * @param {string} currentStatus  status stored on the application
 * @param {string} newStatus      status being applied
 * @param {number} totalDays      days the application covers
 * @returns {{outcome: 'unchanged'|'changed', usedDelta: number}}
 *          usedDelta is added to `used` and subtracted from `balance`.
 */
const planStatusChange = (currentStatus, newStatus, totalDays) => {
    // Re-applying the same status is a no-op. This is what stops a double click,
    // a client retry, or two reviewers acting at once from deducting twice.
    if (currentStatus === newStatus) {
        return { outcome: 'unchanged', usedDelta: 0 };
    }

    const days = Number(totalDays) || 0;

    if (newStatus === APPROVED) {
        // Entering Approved consumes the days
        return { outcome: 'changed', usedDelta: days };
    }

    if (currentStatus === APPROVED) {
        // Leaving Approved gives them back. Without this the balance drifts
        // permanently down every time an approval is reversed.
        return { outcome: 'changed', usedDelta: -days };
    }

    // Pending → Rejected and similar: status moves, balance does not
    return { outcome: 'changed', usedDelta: 0 };
};

module.exports = { planStatusChange, APPROVED };
