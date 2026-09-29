import { useState, useEffect, useCallback } from 'react';
import { Trash2, RotateCcw, RefreshCw, AlertCircle } from 'lucide-react';
import api from '../api';
import { useToast, Button, ListPage, ListSearch, ListSelection, ListIconButton, LIST_THEAD, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST } from '../components';
import Modal from '../components/Modal';
import useTableControls from '../hooks/useTableControls';
import { SortableTh, TablePager } from '../components/TableControls';
import { formatDateTime } from '../utils/dateFormat';

/**
 * Employees who have been removed.
 *
 * Delete used to be permanent, and not only for the employee row — it took
 * every punch, daily summary, leave application, leave balance and document
 * belonging to that person with it. One button on the Employees page, no undo,
 * nothing written down. Attendance records are what payroll is argued from.
 *
 * Delete is now a status change, and this is where those records go. Biometric
 * access is revoked at the reader either way, so restoring someone brings back
 * their record and their history but not their enrolment — they have to put
 * their finger on a device again.
 */
export default function DeletedEmployees() {
    const toast = useToast();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [confirmRestore, setConfirmRestore] = useState(false);

    const controls = useTableControls(rows, {
        searchKeys: ['employee_code', 'name', 'department_name', 'designation'],
        initialSort: { key: 'deleted_at', dir: 'desc' },
        pageSize: 25
    });

    const fetchDeleted = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/employees?view=deleted');
            setRows(res.data || []);
            setError(null);
        } catch (err) {
            setError(err.response?.data?.error || 'Could not load deleted employees');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchDeleted(); }, [fetchDeleted]);

    const toggle = (id) => setSelectedIds(prev =>
        prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );

    const restore = async () => {
        try {
            const res = await api.post('/api/employees/restore', { ids: selectedIds });
            toast.success(res.data?.message || 'Restored');
            setSelectedIds([]);
            fetchDeleted();
        } catch (err) {
            toast.error('Restore failed: ' + (err.response?.data?.error || err.message));
        }
        setConfirmRestore(false);
    };

    const when = (v) => v ? formatDateTime(v) : '—';

    return (
        <>
        <ListPage
            title="Deleted Employees"
            count={rows.length}
            toolbarActive={selectedIds.length > 0}
            toolbar={
                <>
                    <ListSearch label="Search deleted employees" placeholder="Search deleted employees…" value={controls.query} onChange={controls.setQuery} />
                    <ListSelection count={selectedIds.length} onClear={() => setSelectedIds([])} />
                    <div className="ml-auto flex items-center gap-2 flex-wrap">
                        <Button
                            variant="primary"
                            size="toolbar"
                            icon={RotateCcw}
                            disabled={selectedIds.length === 0}
                            onClick={() => setConfirmRestore(true)}
                        >
                            Restore{selectedIds.length ? ` (${selectedIds.length})` : ''}
                        </Button>
                        <ListIconButton label="Refresh" icon={RefreshCw} onClick={fetchDeleted} disabled={loading} spin={loading} />
                    </div>
                </>
            }
            footer={!loading && !error && controls.matched > 0 ? <TablePager controls={controls} noun="deleted employee" /> : null}
        >
                {loading ? (
                    <div className="p-5 space-y-2" aria-busy="true">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-700/50 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-20 text-center px-6">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load deleted employees</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchDeleted}>Try again</Button>
                    </div>
                ) : controls.matched === 0 ? (
                    <div className="py-20 text-center px-6">
                        <Trash2 size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                            {controls.isFiltered ? 'No matching records' : 'Nothing deleted'}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {controls.isFiltered
                                ? 'No deleted employee matches that search.'
                                : 'Employees removed from the Employees page appear here.'}
                        </p>
                    </div>
                ) : (
                            <table className="w-full text-left text-sm border-collapse">
                                <thead className={LIST_THEAD}>
                                    <tr>
                                        <th className={`${LIST_TH} ${LIST_EDGE_FIRST} w-10`}></th>
                                        <SortableTh controls={controls} sortKey="employee_code" className={`${LIST_TH} !px-4`}>Employee ID</SortableTh>
                                        <SortableTh controls={controls} sortKey="name" className={`${LIST_TH} !px-4`}>Full Name</SortableTh>
                                        <SortableTh controls={controls} sortKey="department_name" className={`${LIST_TH} !px-4`}>Department</SortableTh>
                                        <SortableTh controls={controls} sortKey="designation" className={`${LIST_TH} !px-4`}>Designation</SortableTh>
                                        <SortableTh controls={controls} sortKey="deleted_at" className={`${LIST_TH} !pl-4 !pr-4 sm:!pr-6`}>Deleted</SortableTh>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {controls.view.map(emp => (
                                        <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                            <td className={`${LIST_EDGE_FIRST} pr-4 py-3`}>
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4"
                                                    checked={selectedIds.includes(emp.id)}
                                                    onChange={() => toggle(emp.id)}
                                                    aria-label={`Select ${emp.name || emp.employee_code}`}
                                                />
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                                                {emp.employee_code}
                                            </td>
                                            <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">
                                                {emp.name || '—'}
                                            </td>
                                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{emp.department_name || '—'}</td>
                                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{emp.designation || '—'}</td>
                                            <td className={`pl-4 ${LIST_EDGE_LAST} py-3 text-slate-500 dark:text-slate-400 tabular-nums`}>{when(emp.deleted_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                )}
        </ListPage>

            <Modal
                open={confirmRestore}
                onClose={() => setConfirmRestore(false)}
                title="Restore employees"
                size="sm"
                footer={<>
                    <Button variant="secondary" onClick={() => setConfirmRestore(false)}>Cancel</Button>
                    <Button variant="primary" icon={RotateCcw} onClick={restore}>Restore</Button>
                </>}
            >
                <p className="text-sm text-slate-600 dark:text-slate-400">
                    Restore {selectedIds.length} employee(s) to the active list? Their attendance history
                    is already intact.
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-3">
                    Biometrics were removed from the readers when they were deleted, so they will need to
                    enrol again before they can open a door.
                </p>
            </Modal>
        </>
    );
}
