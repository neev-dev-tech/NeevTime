import React, { useEffect, useState } from 'react';
import { RefreshCw, Plus, Users, Zap } from 'lucide-react';
import api from '../api';
import { Button, PageHeader, useToast } from '../components';

/**
 * Rotation patterns: week A days, week B nights, generated into the schedule
 * five weeks ahead. The generator never overwrites a hand-entered schedule —
 * a person's decision beats a pattern's.
 */
export default function ShiftRotations() {
    const toast = useToast();
    const [rotations, setRotations] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [form, setForm] = useState(null);       // creating a rotation
    const [crewOf, setCrewOf] = useState(null);   // assigning a crew
    const [crew, setCrew] = useState([]);
    const [crewForm, setCrewForm] = useState({ employee_ids: [], slot_offset: 0, starts_on: '' });
    const [busy, setBusy] = useState(false);

    const load = () => Promise.all([
        api.get('/api/rotations').then(r => setRotations(r.data)),
        api.get('/api/shifts').then(r => setShifts((r.data || []).filter(s => s.is_active !== false))),
        api.get('/api/employees').then(r => setEmployees((r.data || []).filter(e => (e.status || '').toLowerCase() !== 'resigned'))),
    ]).catch(() => toast.error('Could not load rotations'));
    useEffect(() => { load(); }, []);

    const saveRotation = async () => {
        if (!form.name || !form.anchor_date || form.shift_sequence.some(v => v === '')) {
            return toast.warning('Name, start date and every slot are required');
        }
        setBusy(true);
        try {
            await api.post('/api/rotations', {
                ...form,
                shift_sequence: form.shift_sequence.map(v => v === 'off' ? null : Number(v)),
            });
            setForm(null);
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not save');
        } finally { setBusy(false); }
    };

    const openCrew = async (rot) => {
        setCrewOf(rot);
        setCrewForm({ employee_ids: [], slot_offset: 0, starts_on: '' });
        try { setCrew((await api.get(`/api/rotations/${rot.id}/crew`)).data); } catch { setCrew([]); }
    };

    const addCrew = async () => {
        if (!crewForm.employee_ids.length || !crewForm.starts_on) {
            return toast.warning('Pick people and a start date');
        }
        setBusy(true);
        try {
            await api.post(`/api/rotations/${crewOf.id}/crew`, crewForm);
            openCrew(crewOf);
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not assign');
        } finally { setBusy(false); }
    };

    const generateNow = async () => {
        setBusy(true);
        try {
            const res = await api.post('/api/rotations/generate');
            toast.success(`Generated ${res.data.generated} schedule row(s), ${res.data.horizon_days} days ahead`);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Generation failed');
        } finally { setBusy(false); }
    };

    return (
        <div className="space-y-5">
            <PageHeader
                icon={RefreshCw}
                title="Shift Rotations"
                subtitle="Repeating patterns — week A days, week B nights — generated into the schedule ahead"
                actions={
                    <>
                        <Button variant="secondary" icon={Zap} onClick={generateNow} disabled={busy}>Generate now</Button>
                        <Button variant="primary" icon={Plus}
                                onClick={() => setForm({ name: '', period_days: 7, anchor_date: '', shift_sequence: ['', ''] })}>
                            Add rotation
                        </Button>
                    </>
                }
            />

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                {rotations.length === 0 ? (
                    <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                        No rotations yet. A rotation is an ordered list of shifts; each crew steps
                        through it, offset so the shifts stay covered. The nightly generator keeps
                        five weeks of schedule ahead.
                    </div>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-900/40 text-[10px] uppercase tracking-[0.09em] font-bold text-slate-500 dark:text-slate-400">
                            <tr>
                                <th className="px-5 py-3">Rotation</th>
                                <th className="px-5 py-3">Pattern</th>
                                <th className="px-5 py-3">Period</th>
                                <th className="px-5 py-3 text-right">Crew</th>
                                <th className="px-5 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {rotations.map(r => (
                                <tr key={r.id} className={r.is_active ? '' : 'opacity-50'}>
                                    <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-100">{r.name}</td>
                                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                                        {(r.shift_sequence || []).map(id =>
                                            id === null ? 'Off' : (shifts.find(s => s.id === id)?.name || `#${id}`)
                                        ).join(' → ')}
                                    </td>
                                    <td className="px-5 py-3 tabular-nums text-slate-600 dark:text-slate-300">{r.period_days}d</td>
                                    <td className="px-5 py-3 text-right tabular-nums font-semibold">{r.crew}</td>
                                    <td className="px-5 py-3 text-right">
                                        <Button size="sm" variant="secondary" icon={Users} onClick={() => openCrew(r)}>Crew</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {form && (
                <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50" onClick={() => setForm(null)}>
                    <div onClick={e => e.stopPropagation()} className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl p-6 space-y-4">
                        <h3 className="font-bold text-slate-800 dark:text-slate-100">Add rotation</h3>
                        <input className="field w-full" placeholder="Name, e.g. AB Weekly" value={form.name}
                               onChange={e => setForm({ ...form, name: e.target.value })} />
                        <div className="grid grid-cols-2 gap-3">
                            <label className="text-xs text-slate-500">Days per slot
                                <input type="number" min="1" className="field mt-1" value={form.period_days}
                                       onChange={e => setForm({ ...form, period_days: Number(e.target.value) || 7 })} /></label>
                            <label className="text-xs text-slate-500">Pattern starts (a slot-1 day)
                                <input type="date" className="field mt-1" value={form.anchor_date}
                                       onChange={e => setForm({ ...form, anchor_date: e.target.value })} /></label>
                        </div>
                        <div className="space-y-2">
                            {form.shift_sequence.map((v, i) => (
                                <div key={i} className="flex gap-2 items-center">
                                    <span className="text-xs w-12 text-slate-500">Slot {i + 1}</span>
                                    <select className="field flex-1" value={v}
                                            onChange={e => setForm({ ...form, shift_sequence: form.shift_sequence.map((x, j) => j === i ? e.target.value : x) })}>
                                        <option value="">Pick a shift…</option>
                                        <option value="off">Week off</option>
                                        {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                    {form.shift_sequence.length > 1 && (
                                        <button className="text-rose-500 text-sm" onClick={() => setForm({ ...form, shift_sequence: form.shift_sequence.filter((_, j) => j !== i) })}>✕</button>
                                    )}
                                </div>
                            ))}
                            <Button size="sm" variant="secondary" onClick={() => setForm({ ...form, shift_sequence: [...form.shift_sequence, ''] })}>
                                Add slot
                            </Button>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
                            <Button variant="primary" onClick={saveRotation} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
                        </div>
                    </div>
                </div>
            )}

            {crewOf && (
                <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50" onClick={() => setCrewOf(null)}>
                    <div onClick={e => e.stopPropagation()} className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
                        <h3 className="font-bold text-slate-800 dark:text-slate-100">Crew — {crewOf.name}</h3>
                        {crew.length > 0 && (
                            <div className="text-sm divide-y divide-slate-100 dark:divide-slate-700">
                                {crew.map(m => (
                                    <p key={m.id} className="py-1.5 text-slate-600 dark:text-slate-300">
                                        <span className="font-mono text-xs">{m.employee_code}</span> {m.name}
                                        <span className="text-xs text-slate-400"> · offset {m.slot_offset}, from {String(m.starts_on).split('T')[0]}</span>
                                    </p>
                                ))}
                            </div>
                        )}
                        <select multiple size={7} className="field w-full" value={crewForm.employee_ids.map(String)}
                                onChange={e => setCrewForm({ ...crewForm, employee_ids: [...e.target.selectedOptions].map(o => Number(o.value)) })}>
                            {employees.map(e => <option key={e.id} value={e.id}>{e.employee_code} — {e.name}</option>)}
                        </select>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="text-xs text-slate-500">Slot offset (staggers crews)
                                <input type="number" min="0" className="field mt-1" value={crewForm.slot_offset}
                                       onChange={e => setCrewForm({ ...crewForm, slot_offset: Number(e.target.value) || 0 })} /></label>
                            <label className="text-xs text-slate-500">Starts on
                                <input type="date" className="field mt-1" value={crewForm.starts_on}
                                       onChange={e => setCrewForm({ ...crewForm, starts_on: e.target.value })} /></label>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setCrewOf(null)}>Close</Button>
                            <Button variant="primary" onClick={addCrew} disabled={busy}>{busy ? 'Adding…' : 'Add to crew'}</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
