import React, { useEffect, useState } from 'react';
import { RefreshCw, Plus, Users, Zap } from 'lucide-react';
import api from '../api';
import {
    Button, useToast, ListPage,
    LIST_THEAD, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST
} from '../components';
import Modal from '../components/Modal';
import { toDateOnly } from '../utils/dateFormat';

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
    const [loading, setLoading] = useState(true);

    const load = () => Promise.all([
        api.get('/api/rotations').then(r => setRotations(r.data)),
        api.get('/api/shifts').then(r => setShifts((r.data || []).filter(s => s.is_active !== false))),
        api.get('/api/employees').then(r => setEmployees((r.data || []).filter(e => (e.status || '').toLowerCase() !== 'resigned'))),
    ]).catch(() => toast.error('Could not load rotations'))
      .finally(() => setLoading(false));
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
        <>
            <ListPage
                title="Shift Rotations"
                count={rotations.length}
                actions={
                    <>
                        <Button variant="tonal" size="toolbar" icon={Zap} onClick={generateNow} disabled={busy}>Generate now</Button>
                        <Button mutating variant="primary" size="toolbar" icon={Plus}
                                onClick={() => setForm({ name: '', period_days: 7, anchor_date: '', shift_sequence: ['', ''] })}>
                            Add rotation
                        </Button>
                    </>
                }
            >
                {loading ? (
                    <div className="p-4 sm:p-6 space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : rotations.length === 0 ? (
                    <div className="py-20 px-6 text-center">
                        <RefreshCw size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No rotations yet</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
                            Use Add rotation to define an ordered list of shifts; each crew steps
                            through it, offset so the shifts stay covered. The nightly generator keeps
                            five weeks of schedule ahead.
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className={LIST_THEAD}>
                            <tr>
                                <th className={`${LIST_TH} ${LIST_EDGE_FIRST}`}>Rotation</th>
                                <th className={LIST_TH}>Pattern</th>
                                <th className={LIST_TH}>Period</th>
                                <th className={`${LIST_TH} !text-right`}>Crew</th>
                                <th className={`${LIST_TH} ${LIST_EDGE_LAST}`}></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {rotations.map(r => (
                                <tr key={r.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${r.is_active ? '' : 'opacity-50'}`}>
                                    <td className={`${LIST_EDGE_FIRST} pr-4 py-3 font-semibold text-slate-800 dark:text-slate-100`}>{r.name}</td>
                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                        {(r.shift_sequence || []).map(id =>
                                            id === null ? 'Off' : (shifts.find(s => s.id === id)?.name || `#${id}`)
                                        ).join(' → ')}
                                    </td>
                                    <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-300">{r.period_days}d</td>
                                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{r.crew}</td>
                                    <td className={`pl-4 ${LIST_EDGE_LAST} py-3 text-right`}>
                                        <Button size="sm" variant="secondary" icon={Users} onClick={() => openCrew(r)}>Crew</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </ListPage>

            {form && (
                <Modal open onClose={() => setForm(null)} title="Add rotation" size="md">
                    <div className="space-y-4">
                        <input className="field w-full" placeholder="Name, e.g. AB Weekly" value={form.name}
                               onChange={e => setForm({ ...form, name: e.target.value })} />
                        <div className="grid grid-cols-2 gap-3">
                            <label className="text-xs text-slate-600">Days per slot
                                <input type="number" min="1" className="field mt-1" value={form.period_days}
                                       onChange={e => setForm({ ...form, period_days: Number(e.target.value) || 7 })} /></label>
                            <label className="text-xs text-slate-600">Pattern starts (a slot-1 day)
                                <input type="date" className="field mt-1" value={form.anchor_date}
                                       onChange={e => setForm({ ...form, anchor_date: e.target.value })} /></label>
                        </div>
                        <div className="space-y-2">
                            {form.shift_sequence.map((v, i) => (
                                <div key={i} className="flex gap-2 items-center">
                                    <span className="text-xs w-12 text-slate-600">Slot {i + 1}</span>
                                    <select className="field flex-1" value={v}
                                            onChange={e => setForm({ ...form, shift_sequence: form.shift_sequence.map((x, j) => j === i ? e.target.value : x) })}>
                                        <option value="">Pick a shift…</option>
                                        <option value="off">Week off</option>
                                        {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                    {form.shift_sequence.length > 1 && (
                                        <button type="button" aria-label="Remove this step" className="text-rose-500 text-sm" onClick={() => setForm({ ...form, shift_sequence: form.shift_sequence.filter((_, j) => j !== i) })}>✕</button>
                                    )}
                                </div>
                            ))}
                            <Button size="sm" variant="secondary" onClick={() => setForm({ ...form, shift_sequence: [...form.shift_sequence, ''] })}>
                                Add slot
                            </Button>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
                            <Button defaultAction variant="primary" onClick={saveRotation} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
                        </div>
                    </div>
                </Modal>
            )}

            {crewOf && (
                <Modal open onClose={() => setCrewOf(null)} title={`Crew — ${crewOf.name}`} size="md">
                    <div className="space-y-4">
                        {crew.length > 0 && (
                            <div className="text-sm divide-y divide-slate-100 dark:divide-slate-700">
                                {crew.map(m => (
                                    <p key={m.id} className="py-1.5 text-slate-600 dark:text-slate-300">
                                        <span className="font-mono text-xs">{m.employee_code}</span> {m.name}
                                        <span className="text-xs text-slate-500"> · offset {m.slot_offset}, from {toDateOnly(m.starts_on)}</span>
                                    </p>
                                ))}
                            </div>
                        )}
                        <select multiple size={7} className="field w-full" value={crewForm.employee_ids.map(String)}
                                onChange={e => setCrewForm({ ...crewForm, employee_ids: [...e.target.selectedOptions].map(o => Number(o.value)) })}>
                            {employees.map(e => <option key={e.id} value={e.id}>{e.employee_code} — {e.name}</option>)}
                        </select>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="text-xs text-slate-600">Slot offset (staggers crews)
                                <input type="number" min="0" className="field mt-1" value={crewForm.slot_offset}
                                       onChange={e => setCrewForm({ ...crewForm, slot_offset: Number(e.target.value) || 0 })} /></label>
                            <label className="text-xs text-slate-600">Starts on
                                <input type="date" className="field mt-1" value={crewForm.starts_on}
                                       onChange={e => setCrewForm({ ...crewForm, starts_on: e.target.value })} /></label>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setCrewOf(null)}>Close</Button>
                            <Button defaultAction variant="primary" onClick={addCrew} disabled={busy}>{busy ? 'Adding…' : 'Add to crew'}</Button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
