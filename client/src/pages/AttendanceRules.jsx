import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { Plus, Edit2, Trash2, Save, Globe, Building2, Clock, AlertTriangle, CheckCircle, Calendar, AlertCircle, RefreshCw } from 'lucide-react';
import { useToast, Button, ListPage, ListTabs, LIST_THEAD, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST } from '../components';
import Modal from '../components/Modal';
import { confirm } from '../components/ConfirmDialog';

export default function AttendanceRules() {
    const toast = useToast();
    const [rules, setRules] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [activeTab, setActiveTab] = useState('global');

    const [form, setForm] = useState({
        rule_type: 'global',
        department_id: '',
        name: '',
        late_threshold_minutes: 15,
        early_leave_threshold_minutes: 15,
        half_day_threshold_minutes: 240,
        absent_threshold_minutes: 480,
        overtime_enabled: false,
        overtime_threshold_minutes: 30,
        overtime_multiplier: 1.5,
        grace_period_minutes: 5,
        grace_late_allowed_per_month: 3,
        week_off_days: ['saturday', 'sunday'],
        alternate_saturday: false,
        round_off_minutes: 15,
        minimum_punch_gap_minutes: 30
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setError(null);
            const [globalRes, deptRulesRes, deptRes] = await Promise.all([
                api.get('/api/rules/global'),
                api.get('/api/rules/department'),
                api.get('/api/departments')
            ]);

            setRules([
                ...globalRes.data.map(r => ({ ...r, rule_type: 'global' })),
                ...deptRulesRes.data.map(r => ({ ...r, rule_type: 'department' }))
            ]);
            setDepartments(deptRes.data || []);
        } catch (err) {
            console.error('Error fetching rules:', err);
            setError(err.response?.data?.error || 'Could not load attendance rules');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...form,
                department_id: form.rule_type === 'department' ? parseInt(form.department_id) : null
            };

            if (editingId) {
                await api.put(`/api/rules/${editingId}`, payload);
            } else {
                await api.post('/api/rules', payload);
            }
            fetchData();
            closeModal();
        } catch (err) {
            console.error('Error saving rule:', err);
            toast.error('Error saving rule');
        }
    };

    const handleDelete = async (id) => {
        if (!(await confirm({ title: 'Delete', confirmText: 'Delete', type: 'danger', message: 'Are you sure you want to delete this rule?' }))) return;
        try {
            await api.delete(`/api/rules/${id}`);
            fetchData();
        } catch (err) {
            console.error('Error deleting rule:', err);
        }
    };

    const openEdit = (rule) => {
        setForm({
            rule_type: rule.rule_type || 'global',
            department_id: rule.department_id?.toString() || '',
            name: rule.name || '',
            late_threshold_minutes: rule.late_threshold_minutes || 15,
            early_leave_threshold_minutes: rule.early_leave_threshold_minutes || 15,
            half_day_threshold_minutes: rule.half_day_threshold_minutes || 240,
            absent_threshold_minutes: rule.absent_threshold_minutes || 480,
            overtime_enabled: rule.overtime_enabled || false,
            overtime_threshold_minutes: rule.overtime_threshold_minutes || 30,
            overtime_multiplier: rule.overtime_multiplier || 1.5,
            grace_period_minutes: rule.grace_period_minutes || 5,
            grace_late_allowed_per_month: rule.grace_late_allowed_per_month || 3,
            week_off_days: rule.week_off_days || ['saturday', 'sunday'],
            alternate_saturday: rule.alternate_saturday || false,
            round_off_minutes: rule.round_off_minutes || 15,
            minimum_punch_gap_minutes: rule.minimum_punch_gap_minutes || 30
        });
        setEditingId(rule.id);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingId(null);
        setForm({
            rule_type: 'global',
            department_id: '',
            name: '',
            late_threshold_minutes: 15,
            early_leave_threshold_minutes: 15,
            half_day_threshold_minutes: 240,
            absent_threshold_minutes: 480,
            overtime_enabled: false,
            overtime_threshold_minutes: 30,
            overtime_multiplier: 1.5,
            grace_period_minutes: 5,
            grace_late_allowed_per_month: 3,
            week_off_days: ['saturday', 'sunday'],
            alternate_saturday: false,
            round_off_minutes: 15,
            minimum_punch_gap_minutes: 30
        });
    };

    const toggleWeekOff = (day) => {
        const days = [...form.week_off_days];
        const index = days.indexOf(day);
        if (index > -1) {
            days.splice(index, 1);
        } else {
            days.push(day);
        }
        setForm({ ...form, week_off_days: days });
    };

    const globalRules = rules.filter(r => r.rule_type === 'global');
    const departmentRules = rules.filter(r => r.rule_type === 'department');
    const weekDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    // One row per rule: thresholds as columns so rules compare side by side.
    const RuleTable = ({ items, showDepartment }) => (
        <table className="w-full text-sm text-left">
            <thead className={LIST_THEAD}>
                <tr>
                    <th className={`${LIST_TH} ${LIST_EDGE_FIRST}`}>Rule</th>
                    {showDepartment && <th className={LIST_TH}>Department</th>}
                    <th className={`${LIST_TH} !text-right`}>Late after</th>
                    <th className={`${LIST_TH} !text-right`}>Early leave</th>
                    <th className={`${LIST_TH} !text-right`}>Grace</th>
                    <th className={`${LIST_TH} !text-right`}>Half day</th>
                    <th className={LIST_TH}>Week off</th>
                    <th className={LIST_TH}>Overtime</th>
                    <th className={`${LIST_TH} ${LIST_EDGE_LAST}`}><span className="sr-only">Actions</span></th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map(rule => (
                    <tr key={rule.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className={`${LIST_EDGE_FIRST} pr-4 py-3 font-medium text-slate-900 dark:text-slate-100`}>{rule.name || '—'}</td>
                        {showDepartment && <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{rule.department_name || '—'}</td>}
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{rule.late_threshold_minutes ?? '—'} min</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{rule.early_leave_threshold_minutes ?? '—'} min</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{rule.grace_period_minutes ?? '—'} min</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{rule.half_day_threshold_minutes ?? '—'} min</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                            {rule.week_off_days?.length
                                ? rule.week_off_days.map(d => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(', ')
                                : '—'}
                            {rule.alternate_saturday && <span className="block text-xs text-slate-600 dark:text-slate-400">+ alternate Saturdays</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300 tabular-nums">
                            {rule.overtime_enabled ? `On · ${rule.overtime_multiplier}×` : 'Off'}
                        </td>
                        <td className={`pl-4 ${LIST_EDGE_LAST} py-3`}>
                            <div className="flex items-center justify-end gap-1.5">
                                <Button variant="tonal" size="toolbar" icon={Edit2} onClick={() => openEdit(rule)}>Edit</Button>
                                <Button variant="danger" size="toolbar" icon={Trash2} aria-label={`Delete ${rule.name}`} title="Delete" onClick={() => handleDelete(rule.id)} />
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    return (
        <>
            <ListPage
                title="Attendance Rules"
                count={rules.length}
                tabs={
                    <ListTabs
                        label="Rule type"
                        value={activeTab}
                        onChange={setActiveTab}
                        items={[
                            { key: 'global', label: 'Global Rules', count: globalRules.length },
                            { key: 'department', label: 'Department Rules', count: departmentRules.length }
                        ]}
                    />
                }
                actions={
                    <Button mutating variant="primary" size="toolbar" icon={Plus} onClick={() => setShowModal(true)}>Add Rule</Button>
                }
            >
                {/* The attendance engine does not read these rules yet. Saying so
                    here stops anyone tuning a grace period that changes nothing. */}
                <details role="note" className="px-4 sm:px-6 py-2 border-b border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-[13px] text-amber-900 dark:text-amber-200">
                    <summary className="cursor-pointer list-none flex items-center gap-2">
                        <AlertTriangle size={15} className="shrink-0" />
                        <span><strong className="font-semibold">Saved, but not yet used in attendance calculation.</strong> Late marks and grace come from <Link to="/shifts" className="underline underline-offset-2">Shifts</Link>, then <Link to="/settings/attendance" className="underline underline-offset-2">Attendance Defaults</Link>.</span>
                        <span className="text-xs underline underline-offset-2">More</span>
                    </summary>
                    <p className="mt-1.5 pl-6">
                        Week-offs come from <Link to="/settings/weekend" className="underline underline-offset-2">Weekend Rules</Link>.
                        Global rules are meant for all employees; a department rule is meant to override them for that department. Keep at least one global rule.
                    </p>
                </details>

                {/* Rules Grid */}
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load rules</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Try again</Button>
                    </div>
                ) : activeTab === 'global' ? (
                    globalRules.length === 0 ? (
                        <div className="py-16 text-center">
                            <Globe size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No global rules yet</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 max-w-sm mx-auto">
                                A global rule sets the default late, grace, and overtime policy for everyone.
                            </p>
                            <Button mutating variant="primary" onClick={() => setShowModal(true)}>Create Now</Button>
                        </div>
                    ) : (
                        <RuleTable items={globalRules} />
                    )
                ) : (
                    departmentRules.length === 0 ? (
                        <div className="py-16 text-center">
                            <Building2 size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No department rules yet</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
                                Department rules override the global policy for one team only.
                            </p>
                        </div>
                    ) : (
                        <RuleTable items={departmentRules} showDepartment />
                    )
                )}
            </ListPage>

            <Modal
                open={showModal}
                onClose={closeModal}
                title={editingId ? 'Edit Attendance Rule' : 'Add Attendance Rule'}
                size="lg"
                footer={
                    <>
                        <Button variant="secondary" onClick={closeModal}>Cancel</Button>
                        <Button icon={Save} onClick={handleSubmit}>
                            {editingId ? 'Update Rule' : 'Create Rule'}
                        </Button>
                    </>
                }
            >
                <form id="ruleForm" onSubmit={handleSubmit} className="space-y-6">
                    {/* Rule Type */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">Rule Type <span className="text-red-500">*</span></label>
                            <select
                                value={form.rule_type}
                                onChange={e => setForm({ ...form, rule_type: e.target.value })}
                                className="input-premium dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                            >
                                <option value="global">Global Rule</option>
                                <option value="department">Department Specific</option>
                            </select>
                        </div>
                        {form.rule_type === 'department' && (
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">Department <span className="text-red-500">*</span></label>
                                <select
                                    value={form.department_id}
                                    onChange={e => setForm({ ...form, department_id: e.target.value })}
                                    className="input-premium dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                    required
                                >
                                    <option value="">Select Department</option>
                                    {departments.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">Rule Name <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                            className="input-premium dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                            placeholder="e.g., Default Policy, Sales Team Rules"
                            required
                        />
                    </div>

                    {/* Time Thresholds */}
                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
                        <h3 className="font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                            <Clock size={16} className="text-slate-600" /> Time Thresholds
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Late After (min)</label>
                                <input
                                    type="number"
                                    value={form.late_threshold_minutes || ''}
                                    onChange={e => setForm({ ...form, late_threshold_minutes: e.target.value ? parseInt(e.target.value) || 0 : 0 })}
                                    className="input-premium bg-app-surface dark:border-slate-600 dark:text-slate-100"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Early Leave (min)</label>
                                <input
                                    type="number"
                                    value={form.early_leave_threshold_minutes || ''}
                                    onChange={e => setForm({ ...form, early_leave_threshold_minutes: e.target.value ? parseInt(e.target.value) || 0 : 0 })}
                                    className="input-premium bg-app-surface dark:border-slate-600 dark:text-slate-100"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Half Day (min)</label>
                                <input
                                    type="number"
                                    value={form.half_day_threshold_minutes || ''}
                                    onChange={e => setForm({ ...form, half_day_threshold_minutes: e.target.value ? parseInt(e.target.value) || 0 : 0 })}
                                    className="input-premium bg-app-surface dark:border-slate-600 dark:text-slate-100"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Absent (min)</label>
                                <input
                                    type="number"
                                    value={form.absent_threshold_minutes || ''}
                                    onChange={e => setForm({ ...form, absent_threshold_minutes: e.target.value ? parseInt(e.target.value) || 0 : 0 })}
                                    className="input-premium bg-app-surface dark:border-slate-600 dark:text-slate-100"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Grace Period */}
                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
                        <h3 className="font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                            <CheckCircle size={16} className="text-emerald-500" /> Grace Period
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Grace Minutes</label>
                                <input
                                    type="number"
                                    value={form.grace_period_minutes || ''}
                                    onChange={e => setForm({ ...form, grace_period_minutes: e.target.value ? parseInt(e.target.value) || 0 : 0 })}
                                    className="input-premium bg-app-surface dark:border-slate-600 dark:text-slate-100"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Allowed Count/Month</label>
                                <input
                                    type="number"
                                    value={form.grace_late_allowed_per_month || ''}
                                    onChange={e => setForm({ ...form, grace_late_allowed_per_month: e.target.value ? parseInt(e.target.value) || 0 : 0 })}
                                    className="input-premium bg-app-surface dark:border-slate-600 dark:text-slate-100"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Overtime */}
                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <Calendar size={16} className="text-amber-500" /> Overtime Settings
                            </h3>
                            <label className="toggle-switch cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={form.overtime_enabled}
                                    onChange={e => setForm({ ...form, overtime_enabled: e.target.checked })}
                                    className="sr-only"
                                />
                                <div className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${form.overtime_enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                                    <div className={`w-5 h-5 bg-app-surface rounded-full shadow transition-transform ${form.overtime_enabled ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                </div>
                            </label>
                        </div>
                        {form.overtime_enabled && (
                            <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Min OT Minutes</label>
                                    <input
                                        type="number"
                                        value={form.overtime_threshold_minutes || ''}
                                        onChange={e => setForm({ ...form, overtime_threshold_minutes: e.target.value ? parseInt(e.target.value) || 0 : 0 })}
                                        className="input-premium bg-app-surface dark:border-slate-600 dark:text-slate-100"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">OT Multiplier</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={form.overtime_multiplier || ''}
                                        onChange={e => setForm({ ...form, overtime_multiplier: e.target.value ? parseFloat(e.target.value) || 0 : 0 })}
                                        className="input-premium bg-app-surface dark:border-slate-600 dark:text-slate-100"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Week Off Days */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">Week Off Days</label>
                        <div className="flex flex-wrap gap-2">
                            {weekDays.map(day => (
                                <button
                                    key={day}
                                    type="button"
                                    onClick={() => toggleWeekOff(day)}
                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors border ${form.week_off_days.includes(day)
                                        ? 'bg-slate-600 text-white border-transparent shadow-sm'
                                        : 'bg-app-surface/70 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 hover:text-slate-600 dark:hover:text-slate-400'
                                        }`}
                                >
                                    {day.substring(0, 3)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                        <label className="flex items-center gap-3 cursor-pointer w-full">
                            <div className="relative flex items-center">
                                <input
                                    type="checkbox"
                                    checked={form.alternate_saturday}
                                    onChange={e => setForm({ ...form, alternate_saturday: e.target.checked })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-slate-100 dark:peer-focus:ring-slate-900/40 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-app-surface after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-ui peer-checked:bg-slate-600"></div>
                            </div>
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Alternate Saturday Off</span>
                        </label>
                    </div>
                </form>
            </Modal>
        </>
    );
}
