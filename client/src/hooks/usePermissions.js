/**
 * What the signed-in account is allowed to do.
 *
 * The server is the real boundary — see server/utils/rbac.js. This exists so the
 * interface does not offer buttons that will come back 403, which reads as the
 * app being broken rather than the account being limited.
 *
 * Mirrors the server's tiers deliberately, including treating the retired 'user'
 * role as hr. If the two ever disagree the server wins and the user sees a
 * refusal; that is the safe direction for them to disagree in.
 */

import useStore from '../store/useStore';

const normalise = (role) => {
    if (!role) return 'viewer';
    const r = String(role).toLowerCase();
    if (r === 'admin') return 'admin';
    if (r === 'viewer') return 'viewer';
    return 'hr'; // 'user' and anything unrecognised
};

export function usePermissions() {
    const auth = useStore(state => state.auth);
    const role = normalise(auth?.role);

    return {
        role,
        isAdmin: role === 'admin',
        isHr: role === 'hr',
        isViewer: role === 'viewer',
        /** May change day-to-day data: personnel, attendance, leave, devices. */
        canEdit: role === 'admin' || role === 'hr',
        /** May reach settings, database, integrations and user management. */
        canAdminister: role === 'admin'
    };
}

export default usePermissions;
