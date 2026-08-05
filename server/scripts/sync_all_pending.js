/**
 * Backfill sync script - pushes ALL pending attendance logs to ERPNext
 * Bypasses the 7-day window restriction in the normal sync.
 */

const db = require('../db');
const ERPNextIntegration = require('../services/integrations/erpnext');

const BATCH_SIZE = 200;
const INTEGRATION_ID = 1;

async function syncAllPending() {
    console.log('=== ERPNext Backfill Sync ===');
    console.log('Started at:', new Date().toISOString());

    // Load integration config
    const intResult = await db.query('SELECT * FROM hrms_integrations WHERE id = $1', [INTEGRATION_ID]);
    if (intResult.rows.length === 0) {
        console.error('Integration not found, id=', INTEGRATION_ID);
        process.exit(1);
    }
    const integration = new ERPNextIntegration(intResult.rows[0]);

    // Test connection first
    console.log('\nTesting ERPNext connection...');
    const connTest = await integration.testConnection();
    if (!connTest.success) {
        console.error('Connection test failed:', connTest.message);
        process.exit(1);
    }
    console.log('Connected:', connTest.message);

    // Count total pending
    // 'skipped' must be excluded, not just 'synced'. It marks punches that were
    // deliberately held back — facility, security and test accounts flagged
    // exclude_from_hrms. Sweeping them in made this script target 8,838 records
    // when about 90 were actually stuck, and running it after an outage would
    // have pushed every excluded person into ERPNext, silently undoing that
    // decision. The scheduled sync has always excluded them; this did not.
    const countResult = await db.query(
        "SELECT COUNT(*) FROM attendance_logs WHERE sync_status IS NULL OR sync_status NOT IN ('synced', 'skipped')"
    );
    const totalPending = parseInt(countResult.rows[0].count);
    console.log(`\nTotal pending records: ${totalPending}`);

    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    let batchNum = 0;

    while (true) {
        batchNum++;
        const result = await db.query(`
            SELECT 
                al.*,
                e.name as employee_name,
                e.email
            FROM attendance_logs al
            LEFT JOIN employees e ON al.employee_code = e.employee_code
            WHERE (al.sync_status IS NULL OR al.sync_status NOT IN ('synced', 'skipped'))
            ORDER BY al.punch_time ASC
            LIMIT $1
        `, [BATCH_SIZE]);

        if (result.rows.length === 0) {
            console.log('\nNo more pending records.');
            break;
        }

        const minDate = result.rows[0].punch_time;
        const maxDate = result.rows[result.rows.length - 1].punch_time;
        console.log(`\nBatch ${batchNum}: ${result.rows.length} records | ${minDate} → ${maxDate}`);

        const stats = await integration.pushAttendance(result.rows);

        totalProcessed += stats.processed;
        totalSuccess += stats.success;
        totalFailed += stats.failed;

        const pct = Math.round((totalProcessed / totalPending) * 100);
        console.log(`  Batch result: success=${stats.success}, failed=${stats.failed} | Overall: ${totalProcessed}/${totalPending} (${pct}%)`);

        if (stats.failed_details && stats.failed_details.length > 0) {
            console.log('  Sample errors:', JSON.stringify(stats.failed_details));
        }

        // If all in this batch failed (likely ERPNext issue), abort to avoid infinite loop
        if (stats.success === 0 && stats.failed > 0) {
            console.error('\nERROR: Entire batch failed. Aborting to prevent infinite loop.');
            console.error('Check ERPNext connectivity and employee codes.');
            break;
        }
    }

    console.log('\n=== Sync Complete ===');
    console.log('Finished at:', new Date().toISOString());
    console.log(`Total processed: ${totalProcessed}`);
    console.log(`Total success:   ${totalSuccess}`);
    console.log(`Total failed:    ${totalFailed}`);

    await db.query(`
        UPDATE hrms_integrations 
        SET last_sync_at = NOW(), last_sync_status = $1, last_sync_message = $2
        WHERE id = $3
    `, [
        totalFailed === 0 ? 'success' : 'partial',
        `Backfill: ${totalSuccess} synced, ${totalFailed} failed`,
        INTEGRATION_ID
    ]);

    process.exit(totalFailed > 0 ? 1 : 0);
}

syncAllPending().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
