import React, { useState, useEffect } from 'react';
import api from '../api';
import { Scale, Plus, Edit2, Trash2, X, Save, Globe, Building2, Clock, AlertTriangle, CheckCircle, Calendar } from 'lucide-react';
import { useToast, Button, PageHeader } from '../components';

export default function AttendanceRules() {
    const toast = useToast();
    const [rules, setRules] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
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
        <div className="card-premium group hover:border-orange-200 transition-all duration-300">
            <div className="flex items-start justify-between mb-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className={`h-2 w-2 rounded-full ${rule.rule_type === 'global' ? 'bg-blue-500' : 'bg-emerald-500'}`}></span>
                        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">{rule.name}</h3>
                    </div>
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${rule.rule_type === 'global'
                        ? 'bg-blue-50 text-blue-600 border border-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'
                        : 'bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
                        }`}>
                        {rule.rule_type === 'global' ? 'Global Rule' : rule.department_name}
                    </span>
                </div>
                <div className="flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" icon={Edit2} iconSize={16} onClick={() => openEdit(rule)} title="Edit Rule" aria-label="Edit Rule" />
                    <Button variant="danger" size="sm" icon={Trash2} iconSize={16} onClick={() => handleDelete(rule.id)} title="Delete Rule" aria-label="Delete Rule" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                <div className="bg-slate-50/80 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-100 dark:border-slate-700">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Late Threshold</div>
                    <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1">
                        <Clock size={14} className="text-amber-500" />
                        {rule.late_threshold_minutes} min
                    </div>
                </div>
                <div className="bg-slate-50/80 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-100 dark:border-slate-700">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Early Leave</div>
                    <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1">
                        <Clock size={14} className="text-rose-500" />
                        {rule.early_leave_threshold_minutes} min
                    </div>
                </div>
                <div className="bg-slate-50/80 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-100 dark:border-slate-700">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Grace Period</div>
                    <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1">
                        <CheckCircle size={14} className="text-emerald-500" />
                        {rule.grace_period_minutes} min
                    </div>
                </div>
                <div className="bg-slate-50/80 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-100 dark:border-slate-700">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Half Day</div>
                    <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1">
                        <AlertTriangle size={14} className="text-purple-500" />
                        {rule.half_day_threshold_minutes} min
                    </div>
                </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-slate-400 uppercase">Week Off:</span>
                    {rule.week_off_days?.map(day => (
                        <span key={day} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded text-[10px] font-bold uppercase tracking-wide">
                            {day.substring(0, 3)}
                        </span>
                    ))}
                </div>
                <div className="flex items-center gap-4 text-xs font-medium">
                    {rule.overtime_enabled && (
                        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded">
                            <Clock size={12} /> OT: {rule.overtime_multiplier}x
                        </span>
                    )}
                    {rule.alternate_saturday && (
                        <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">
                            <Calendar size={12} /> Alt. Sat
                        </span>
                    )}
                </div>
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
            <div className="flex gap-2 bg-slate-100/50 dark:bg-slate-700/50 p-1 rounded-xl w-fit border border-slate-200 dark:border-slate-700">
                <button
                    onClick={() => setActiveTab('global')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'global'
                        ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
                >
                    <Globe size={16} />
                    Global Rules
                    <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${activeTab === 'global' ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-slate-200 dark:bg-slate-700'}`}>
                        {globalRules.length}
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('department')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'department'
                        ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
                >
                    <Building2 size={16} />
                    Department Rules
                    <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${activeTab === 'department' ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-slate-200 dark:bg-slate-700'}`}>
                        {departmentRules.length}
                    </span>
                </button>
            </div>

            {/* Info Banner */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3 shadow-sm">
                <div className="p-2 bg-blue-100 rounded-lg text-blue-600 mt-0.5">
                    <AlertTriangle size={18} />
                </div>
                <div className="text-sm text-blue-900 leading-relaxed">
                    <strong className="block mb-0.5 font-semibold">How Rules Work</strong>
                    Global rules apply to all employees by default. Department-specific rules override global rules for employees in that department. Ensure you have at least one global rule.
                </div>
            </div>

            {/* Rules Grid */}
            {loading ? (
                <div className="text-center py-12 text-slate-400 flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                    Loading rules...
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {activeTab === 'global' ? (
                        globalRules.length === 0 ? (
                            <div className="col-span-full py-12 text-center">
                                <div className="w-16 h-16 bg-slate-50 dark:bg-slate-900/50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                    <Globe size={32} />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">No Global Rules</h3>
                                <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">Create a global rule to set the default attendance policy for your organization.</p>
                                <Button variant="primary" className="mt-4" onClick={() => setShowModal(true)}>Create Now</Button>
                            </div>
                        ) : (
                            globalRules.map(rule => <RuleCard key={rule.id} rule={rule} />)
                        )
                    ) : (
                        departmentRules.length === 0 ? (
                            <div className="col-span-full py-12 text-center">
                                <div className="w-16 h-16 bg-slate-50 dark:bg-slate-900/50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                    <Building2 size={32} />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">No Department Rules</h3>
                                <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">Department rules allow you to override global settings for specific teams.</p>
                            </div>
                        ) : (
                            departmentRules.map(rule => <RuleCard key={rule.id} rule={rule} />)
                        )
                    )}
                </div>
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
                                            <div className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${form.overtime_enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
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
                                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all capitalize border ${form.week_off_days.includes(day)
                                                    ? 'bg-slate-800 text-white border-slate-800 shadow-md'
                                                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
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
                                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-100 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
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
