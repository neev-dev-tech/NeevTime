/**
 * ZKTeco / eSSL ADMS command-string builders.
 *
 * The ADMS command vocabulary was, until now, inline template literals scattered
 * across ~28 call sites. This module is the single place those strings are
 * built, so the ZKTeco driver — and, over time, the existing call sites — share
 * one definition instead of drifting apart. The USERINFO format here is copied
 * verbatim from services/adms.js so enrolment behaviour is byte-for-byte
 * unchanged.
 *
 * Field separator is a literal TAB, as the protocol requires.
 */

const TAB = '\t';

/**
 * Enrolment push: create/update a user record on the reader. Mirrors the
 * long-standing format (PIN/Name/Pri/Passwd/Card/Grp/TZ/Verify/Face/FPCount).
 */
function updateUser({ pin, name = '', pri = 0, passwd = '', card = '' }) {
    if (pin == null || pin === '') throw new Error('updateUser requires a pin');
    return [
        `DATA UPDATE USERINFO PIN=${pin}`,
        `Name=${name}`,
        `Pri=${pri}`,
        `Passwd=${passwd}`,
        `Card=${card}`,
        'Grp=1',
        'TZ=1',
        'Verify=0',
        'Face=1',
        'FPCount=1',
    ].join(TAB);
}

const deleteUser = (pin) => {
    if (pin == null || pin === '') throw new Error('deleteUser requires a pin');
    return `DATA DELETE USERINFO PIN=${pin}`;
};

const queryUser = (pin) =>
    pin == null || pin === '' ? 'DATA QUERY USERINFO' : `DATA QUERY USERINFO PIN=${pin}`;

// Fixed, parameterless control commands — exactly the destructive vocabulary the
// /api/device-commands allowlist already recognises.
const reboot = () => 'REBOOT';
const clearAttendanceLogs = () => 'CLEAR LOG';
const clearAllData = () => 'CLEAR DATA';

module.exports = {
    updateUser,
    deleteUser,
    queryUser,
    reboot,
    clearAttendanceLogs,
    clearAllData,
};
