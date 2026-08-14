import React, { useState, useEffect } from 'react';
import api from '../api';
import { Scale, Plus, Edit2, Trash2, X, Save, Globe, Building2, Clock, AlertTriangle, CheckCircle, Calendar, AlertCircle, RefreshCw } from 'lucide-react';
import { useToast, Button, PageHeader } from '../components';

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
        if (!confirm('Are you sure you want to delete this rule?')) return;
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

    const RuleCard = ({ rule }) => (
        <div className="bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 hover:-translate-y-0.5 transition-transform">
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate">{rule.name || '—'}</h3>
                    <span className={`mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${rule.rule_type === 'global'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        }`}>
                        {rule.rule_type === 'global' ? 'Global Rule' : (rule.department_name || '—')}
                    </span>
                </div>
                <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" icon={Edit2} iconSize={16} onClick={() => openEdit(rule)} title="Edit Rule" aria-label="Edit Rule" />
                    <Button variant="danger" size="sm" icon={Trash2} iconSize={16} onClick={() => handleDelete(rule.id)} title="Delete Rule" aria-label="Delete Rule" />
                </div>
            </div>

            <dl className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-white/60 dark:bg-slate-900/50 rounded-xl px-3 py-2 border border-slate-100 dark:border-slate-700">
                    <dt className="text-[10px] uppercase tracking-[0.09em] font-bold text-slate-500 dark:text-slate-400 mb-0.5">Late Threshold</dt>
                    <dd className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums flex items-center gap-1.5">
                        <Clock size={13} className="text-amber-500 dark:text-amber-400" />
                        {rule.late_threshold_minutes ?? '—'} min
                    </dd>
                </div>
                <div className="bg-white/60 dark:bg-slate-900/50 rounded-xl px-3 py-2 border border-slate-100 dark:border-slate-700">
                    <dt className="text-[10px] uppercase tracking-[0.09em] font-bold text-slate-500 dark:text-slate-400 mb-0.5">Early Leave</dt>
                    <dd className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums flex items-center gap-1.5">
                        <Clock size={13} className="text-rose-500 dark:text-rose-400" />
                        {rule.early_leave_threshold_minutes ?? '—'} min
                    </dd>
                </div>
                <div className="bg-white/60 dark:bg-slate-900/50 rounded-xl px-3 py-2 border border-slate-100 dark:border-slate-700">
                    <dt className="text-[10px] uppercase tracking-[0.09em] font-bold text-slate-500 dark:text-slate-400 mb-0.5">Grace Period</dt>
                    <dd className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums flex items-center gap-1.5">
                        <CheckCircle size={13} className="text-emerald-500 dark:text-emerald-400" />
                        {rule.grace_period_minutes ?? '—'} min
                    </dd>
                </div>
                <div className="bg-white/60 dark:bg-slate-900/50 rounded-xl px-3 py-2 border border-slate-100 dark:border-slate-700">
                    <dt className="text-[10px] uppercase tracking-[0.09em] font-bold text-slate-500 dark:text-slate-400 mb-0.5">Half Day</dt>
                    <dd className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums flex items-center gap-1.5">
                        <AlertTriangle size={13} className="text-purple-500 dark:text-purple-400" />
                        {rule.half_day_threshold_minutes ?? '—'} min
                    </dd>
                </div>
            </dl>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-700 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-[0.09em] font-bold text-slate-500 dark:text-slate-400">Week Off</span>
                    {rule.week_off_days?.length ? rule.week_off_days.map(day => (
                        <span key={day} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                            {day.substring(0, 3)}
                        </span>
                    )) : <span className="text-xs text-slate-600 dark:text-slate-300">—</span>}
                </div>
                {(rule.overtime_enabled || rule.alternate_saturday) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        {rule.overtime_enabled && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                <Clock size={10} /> <span className="tabular-nums">OT {rule.overtime_multiplier}x</span>
                            </span>
                        )}
                        {rule.alternate_saturday && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                <Calendar size={10} /> Alt. Sat
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                icon={Scale}
                title="Attendance Rules"
                subtitle="Configure policies for late marks, overtime, and week offs"
                actions={
                    <Button variant="successSolid" icon={Plus} onClick={() => setShowModal(true)}>Add Rule</Button>
                }
            />

            {/* Tabs */}
            <div className="flex flex-wrap gap-1.5">
                <button
                    onClick={() => setActiveTab('global')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${activeTab === 'global'
                        ? 'bg-orange-600 text-white border-transparent shadow-sm'
                        : 'bg-white/70 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-orange-300 hover:text-orange-600 dark:hover:text-orange-400'}`}
                >
                    <Globe size={13} />
                    Global Rules ({globalRules.length})
                </button>
                <button
                    onClick={() => setActiveTab('department')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${activeTab === 'department'
                        ? 'bg-orange-600 text-white border-transparent shadow-sm'
                        : 'bg-white/70 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-orange-300 hover:text-orange-600 dark:hover:text-orange-400'}`}
                >
                    <Building2 size={13} />
                    Department Rules ({departmentRules.length})
                </button>
            </div>

            {/* Info Banner */}
            <div className="bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-start gap-3">
                <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 shrink-0">
                    <AlertTriangle size={16} />
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    <strong className="block mb-0.5 text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">How Rules Work</strong>
                    Global rules apply to all employees by default. Department-specific rules override global rules for employees in that department. Keep at least one global rule.
                </div>
            </div>

            {/* Rules Grid */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-64 rounded-2xl bg-slate-100 dark:bg-slate-700 animate-pulse" />
                    ))}
                </div>
            ) : error ? (
                <div className="card-base !p-0 overflow-hidden">
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load rules</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Try again</Button>
                    </div>
                </div>
            ) : activeTab === 'global' ? (
                globalRules.length === 0 ? (
                    <div className="card-base !p-0 overflow-hidden">
                        <div className="py-16 text-center">
                            <Globe size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No global rules yet</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-sm mx-auto">
                                A global rule sets the default late, grace, and overtime policy for everyone.
                            </p>
                            <Button variant="primary" onClick={() => setShowModal(true)}>Create Now</Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {globalRules.map(rule => <RuleCard key={rule.id} rule={rule} />)}
                        </div>
                        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                            {globalRules.length} rule{globalRules.length === 1 ? '' : 's'}
                        </div>
                    </div>
                )
            ) : (
                departmentRules.length === 0 ? (
                    <div className="card-base !p-0 overflow-hidden">
                        <div className="py-16 text-center">
                            <Building2 size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No department rules yet</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                                Department rules override the global policy for one team only.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {departmentRules.map(rule => <RuleCard key={rule.id} rule={rule} />)}
                        </div>
                        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                            {departmentRules.length} rule{departmentRules.length === 1 ? '' : 's'}
                        </div>
                    </div>
                )
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                                {editingId ? 'Edit Attendance Rule' : 'Add Attendance Rule'}
                            </h2>
                            <Button variant="ghost" icon={X} iconSize={20} onClick={closeModal} aria-label="Close" />
                        </div>
                        <div className="overflow-y-auto p-6 scrollbar-thin">
                            <form id="ruleForm" onSubmit={handleSubmit} className="space-y-6">
                                {/* Rule Type */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Rule Type <span className="text-red-500">*</span></label>
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
                                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Department <span className="text-red-500">*</span></label>
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
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Rule Name <span className="text-red-500">*</span></label>
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
                                        <Clock size={16} className="text-blue-500" /> Time Thresholds
                                    </h3>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Late After (min)</label>
                                            <input
                                                type="number"
                                                value={form.late_threshold_minutes || ''}
                                                onChange={e => setForm({ ...form, late_threshold_minutes: e.target.value ? parseInt(e.target.value) || 0 : 0 })}
                                                className="input-premium bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Early Leave (min)</label>
                                            <input
                                                type="number"
                                                value={form.early_leave_threshold_minutes || ''}
                                                onChange={e => setForm({ ...form, early_leave_threshold_minutes: e.target.value ? parseInt(e.target.value) || 0 : 0 })}
                                                className="input-premium bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Half Day (min)</label>
                                            <input
                                                type="number"
                                                value={form.half_day_threshold_minutes || ''}
                                                onChange={e => setForm({ ...form, half_day_threshold_minutes: e.target.value ? parseInt(e.target.value) || 0 : 0 })}
                                                className="input-premium bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Absent (min)</label>
                                            <input
                                                type="number"
                                                value={form.absent_threshold_minutes || ''}
                                                onChange={e => setForm({ ...form, absent_threshold_minutes: e.target.value ? parseInt(e.target.value) || 0 : 0 })}
                                                className="input-premium bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
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
                                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Grace Minutes</label>
                                            <input
                                                type="number"
                                                value={form.grace_period_minutes || ''}
                                                onChange={e => setForm({ ...form, grace_period_minutes: e.target.value ? parseInt(e.target.value) || 0 : 0 })}
                                                className="input-premium bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Allowed Count/Month</label>
                                            <input
                                                type="number"
                                                value={form.grace_late_allowed_per_month || ''}
                                                onChange={e => setForm({ ...form, grace_late_allowed_per_month: e.target.value ? parseInt(e.target.value) || 0 : 0 })}
                                                className="input-premium bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
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
                                                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${form.overtime_enabled ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                            </div>
                                        </label>
                                    </div>
                                    {form.overtime_enabled && (
                                        <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                                            <div className="space-y-1">
                                                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Min OT Minutes</label>
                                                <input
                                                    type="number"
                                                    value={form.overtime_threshold_minutes || ''}
                                                    onChange={e => setForm({ ...form, overtime_threshold_minutes: e.target.value ? parseInt(e.target.value) || 0 : 0 })}
                                                    className="input-premium bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">OT Multiplier</label>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={form.overtime_multiplier || ''}
                                                    onChange={e => setForm({ ...form, overtime_multiplier: e.target.value ? parseFloat(e.target.value) || 0 : 0 })}
                                                    className="input-premium bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Week Off Days */}
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Week Off Days</label>
                                    <div className="flex flex-wrap gap-2">
                                        {weekDays.map(day => (
                                            <button
                                                key={day}
                                                type="button"
                                                onClick={() => toggleWeekOff(day)}
                                                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors border ${form.week_off_days.includes(day)
                                                    ? 'bg-orange-600 text-white border-transparent shadow-sm'
                                                    : 'bg-white/70 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-orange-300 hover:text-orange-600 dark:hover:text-orange-400'
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
                                            <div className="w-11 h-6 bg-slate-200 dark:bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-100 dark:peer-focus:ring-orange-900/40 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-ui peer-checked:bg-orange-600"></div>
                                        </div>
                                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Alternate Saturday Off</span>
                                    </label>
                                </div>
                            </form>
                        </div>
                        <div className="p-4 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3">
                            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
                            <Button icon={Save} onClick={handleSubmit}>
                                {editingId ? 'Update Rule' : 'Create Rule'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
