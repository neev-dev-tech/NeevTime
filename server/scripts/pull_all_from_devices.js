const db = require('../db');

const DEV_SERIALS = [
    'NYU7254300774',
    'NYU7254000077',
    'NYU7254000093',
    'NYU7254000098'
];

async function pullAll() {
    try {
        for (const SN of DEV_SERIALS) {
            console.log(`🚀 Requesting full data pull from ${SN}...`);
            
            // 1. Pull User Information (Names, Card numbers)
            await db.query(`INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, 'DATA QUERY USERINFO', 'pending', 1)`, [SN]);
            
            // 2. Pull Fingerprints
            await db.query(`INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, 'DATA QUERY FINGERTMP', 'pending', 2)`, [SN]);
            
            // 3. Pull Faces (BIODATA Type 9)
            await db.query(`INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, 'DATA QUERY FACE', 'pending', 3)`, [SN]);

            // 4. Pull ALL historical attendance logs (up to 50k-100k records)
            await db.query(`INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, 'DATA QUERY ATTLOG', 'pending', 4)`, [SN]);
            
            console.log(`  ✅ Commands queued for ${SN}`);
        }
        
        console.log('\n✨ DONE! Devices will start pushing data over the next few minutes.');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

pullAll();
