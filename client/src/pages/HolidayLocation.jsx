import React, { useState, useEffect } from 'react';
import api from '../api';
import { MapPin, Plus, Edit2, Trash2, Save, Calendar, AlertCircle, RefreshCw } from 'lucide-react';
import {
    useToast, Button, ExportMenu, ListPage, ListTabs, ListSearch,
    LIST_THEAD, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST
} from '../components';
import Modal from '../components/Modal';
import { formatDate, formatDateWithWeekday, toDateOnly, toLocalDateString } from '../utils/dateFormat';
import { confirm } from '../components/ConfirmDialog';
import useTableControls from '../hooks/useTableControls';
import { TablePager } from '../components/TableControls';

export default function HolidayLocation({ initialTab = 'locations' }) {
    const toast = useToast();
    const [locations, setLocations] = useState([]);
    const [holidays, setHolidays] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [activeTab, setActiveTab] = useState(initialTab);

    const [form, setForm] = useState({
        name: '',
        description: ''
    });

    const [holidayForm, setHolidayForm] = useState({
        name: '',
        date: '',
        holiday_type: 'national',
        is_optional: false,
        description: ''
    });
    const [showHolidayModal, setShowHolidayModal] = useState(false);
    const [editingHolidayId, setEditingHolidayId] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setError(null);
            const [locRes, holRes] = await Promise.all([
                api.get('/api/holiday-locations'),
                api.get('/api/holidays')
            ]);
            setLocations(locRes.data || []);
            setHolidays(holRes.data || []);
        } catch (err) {
            console.error('Error fetching data:', err);
            setError(err.response?.data?.error || 'Could not load holidays and locations');
        } finally {
            setLoading(false);
        }
    };

    // Location CRUD
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await api.put(`/api/holiday-locations/${editingId}`, form);
            } else {
                await api.post('/api/holiday-locations', form);
            }
            fetchData();
            closeModal();
        } catch (err) {
            console.error('Error saving location:', err);
            toast.error('Error saving location');
        }
    };

    const handleDelete = async (id) => {
        if (!(await confirm({ title: 'Delete', confirmText: 'Delete', type: 'danger', message: 'Are you sure you want to delete this location?' }))) return;
        try {
            await api.delete(`/api/holiday-locations/${id}`);
            fetchData();
        } catch (err) {
            console.error('Error deleting location:', err);
        }
    };

    const openEdit = (location) => {
        setForm({
            name: location.name || '',
            description: location.description || ''
        });
        setEditingId(location.id);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingId(null);
        setForm({ name: '', description: '' });
    };

    // Holiday CRUD
    const handleHolidaySubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingHolidayId) {
                await api.put(`/api/holidays/${editingHolidayId}`, holidayForm);
            } else {
                await api.post('/api/holidays', holidayForm);
            }
            fetchData();
            closeHolidayModal();
        } catch (err) {
            console.error('Error saving holiday:', err);
            toast.error('Error saving holiday');
        }
    };

    const handleHolidayDelete = async (id) => {
        if (!(await confirm({ title: 'Delete', confirmText: 'Delete', type: 'danger', message: 'Are you sure you want to delete this holiday?' }))) return;
        try {
            await api.delete(`/api/holidays/${id}`);
            fetchData();
        } catch (err) {
            console.error('Error deleting holiday:', err);
        }
    };

    const openHolidayEdit = (holiday) => {
        setHolidayForm({
            name: holiday.name || '',
            date: toDateOnly(holiday.date) || '',
            holiday_type: holiday.holiday_type || 'national',
            is_optional: holiday.is_optional || false,
            description: holiday.description || ''
        });
        setEditingHolidayId(holiday.id);
        setShowHolidayModal(true);
    };

    const closeHolidayModal = () => {
        setShowHolidayModal(false);
        setEditingHolidayId(null);
        setHolidayForm({ name: '', date: '', holiday_type: 'national', is_optional: false, description: '' });
    };


    // By calendar day, so a holiday today still counts as upcoming.
    const todayStr = toLocalDateString();
    const daysUntil = (d) => Math.round((new Date(`${toDateOnly(d)}T00:00:00`) - new Date(`${todayStr}T00:00:00`)) / 86400000);
    const whenLabel = (d) => {
        const n = daysUntil(d);
        return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n > 0 ? `in ${n} days` : n === -1 ? 'Yesterday' : `${-n} days ago`;
    };
    const holidayType = (h) => h.holiday_type || h.type || 'national';
    const locationName = (id) => locations.find(l => l.id === id)?.name;
    const holidaysAt = (locId) => holidays.filter(h => h.holiday_location_id === locId).length;
    const upcomingHolidays = holidays
        .filter(h => toDateOnly(h.date) >= todayStr)
        .sort((a, b) => toDateOnly(a.date).localeCompare(toDateOnly(b.date)))
        .slice(0, 5);

    const holidayPager = useTableControls(holidays, {
        searchKeys: ['name', 'description', 'holiday_type', 'type', 'date'],
        pageSize: 50
    });

    return (
        <>
            <ListPage
                title="Holidays & Locations"
                count={activeTab === 'locations' ? locations.length : holidays.length}
                tabs={
                    <ListTabs
                        label="Holidays and locations"
                        value={activeTab}
                        onChange={setActiveTab}
                        items={[
                            { key: 'locations', label: 'Locations', count: locations.length },
                            { key: 'holidays', label: 'Holidays', count: holidays.length }
                        ]}
                    />
                }
                actions={
                    <>
                        {activeTab === 'locations' ? (
                            <ExportMenu
                                rows={locations}
                                columns={[
                                    { key: 'name', label: 'Name' },
                                    { key: 'description', label: 'Description' }
                                ]}
                                filename="holiday-locations"
                                title="Holiday Locations"
                            />
                        ) : (
                            <ExportMenu
                                rows={holidays}
                                columns={[
                                    { key: 'name', label: 'Holiday Name' },
                                    { key: 'date', label: 'Date' },
                                    { key: 'holiday_type', label: 'Type' },
                                    { key: 'is_optional', label: 'Optional' },
                                    { key: 'description', label: 'Description' }
                                ]}
                                filename="holidays"
                                title="Holidays"
                                mapRow={h => ({
                                    ...h,
                                    date: toDateOnly(h.date) || '',
                                    is_optional: h.is_optional ? 'Yes' : 'No'
                                })}
                            />
                        )}
                        <Button mutating variant="primary" size="toolbar"
                            icon={Plus}
                            onClick={() => activeTab === 'locations' ? setShowModal(true) : setShowHolidayModal(true)}
                        >
                            {activeTab === 'locations' ? 'Add Location' : 'Add Holiday'}
                        </Button>
                    </>
                }
                toolbar={activeTab === 'holidays' && !loading && !error && holidays.length > 0 ? (
                    <ListSearch label="Search holidays" placeholder="Search holidays…" value={holidayPager.query} onChange={holidayPager.setQuery} />
                ) : null}
                footer={!loading && !error && activeTab === 'holidays' && holidays.length > 0 ? <TablePager controls={holidayPager} noun="holiday" /> : null}
            >
                {/* Next holidays, one line */}
                {upcomingHolidays.length > 0 && (
                    <div className="flex items-center gap-x-5 gap-y-1 flex-wrap px-4 sm:px-6 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 text-[13px]">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100"><Calendar size={14} /> Coming up</span>
                        {upcomingHolidays.slice(0, 3).map(h => (
                            <span key={h.id} className="text-slate-700 dark:text-slate-300">
                                <span className="font-medium text-slate-900 dark:text-slate-100">{h.name}</span>
                                {' · '}{formatDateWithWeekday(h.date)}
                                <span className="ml-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">{whenLabel(h.date)}</span>
                            </span>
                        ))}
                        {upcomingHolidays.length > 3 && <span className="text-xs text-slate-600 dark:text-slate-400">+{upcomingHolidays.length - 3} more</span>}
                    </div>
                )}

                {loading ? (
                    <div className="p-4 sm:p-6 space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-20 text-center px-6">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load this page</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Try again</Button>
                    </div>
                ) : activeTab === 'locations' ? (
                    /* Locations Grid */
                    locations.length === 0 ? (
                        <div className="py-20 text-center px-6">
                            <MapPin size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No locations yet</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                Locations let you attach region-specific holidays to the right sites.
                            </p>
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className={LIST_THEAD}>
                                <tr>
                                    <th className={`${LIST_TH} ${LIST_EDGE_FIRST}`}>Location</th>
                                    <th className={LIST_TH}>Description</th>
                                    <th className={`${LIST_TH} !text-right`}>Holidays</th>
                                    <th className={`${LIST_TH} ${LIST_EDGE_LAST}`}><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {locations.map(loc => (
                                    <tr key={loc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                        <td className={`${LIST_EDGE_FIRST} pr-4 py-3`}>
                                            <span className="inline-flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                                                <MapPin size={15} className="text-slate-500 dark:text-slate-400 shrink-0" />{loc.name || '—'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{loc.description || '—'}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{holidaysAt(loc.id)}</td>
                                        <td className={`pl-4 ${LIST_EDGE_LAST} py-3`}>
                                            <div className="flex items-center justify-end gap-1.5">
                                                <Button variant="tonal" size="toolbar" icon={Edit2} onClick={() => openEdit(loc)}>Edit</Button>
                                                <Button variant="danger" size="toolbar" icon={Trash2} aria-label={`Delete ${loc.name}`} title="Delete" onClick={() => handleDelete(loc.id)} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                ) : holidays.length === 0 ? (
                    <div className="py-20 text-center px-6">
                        <Calendar size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No holidays yet</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Add a holiday and it will be excluded from attendance for the assigned locations.
                        </p>
                    </div>
                ) : (
                    /* Holidays */
                    <table className="w-full text-sm text-left">
                        <thead className={LIST_THEAD}>
                            <tr>
                                <th className={`${LIST_TH} ${LIST_EDGE_FIRST}`}>Holiday</th>
                                <th className={LIST_TH}>Date</th>
                                <th className={LIST_TH}>When</th>
                                <th className={LIST_TH}>Type</th>
                                <th className={LIST_TH}>Location</th>
                                <th className={LIST_TH}>Required</th>
                                <th className={`${LIST_TH} ${LIST_EDGE_LAST}`}><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {holidayPager.view.map(h => {
                                const past = daysUntil(h.date) < 0;
                                return (
                                    <tr key={h.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${past ? 'text-slate-500 dark:text-slate-400' : ''}`}>
                                        <td className={`${LIST_EDGE_FIRST} pr-4 py-3`}>
                                            <div className={`font-medium ${past ? '' : 'text-slate-900 dark:text-slate-100'}`}>{h.name || '—'}</div>
                                            {h.description && <div className="text-xs text-slate-600 dark:text-slate-400">{h.description}</div>}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums whitespace-nowrap">{formatDateWithWeekday(h.date)}</td>
                                        <td className={`px-4 py-3 whitespace-nowrap text-xs font-medium ${past ? '' : 'text-emerald-700 dark:text-emerald-400'}`}>{whenLabel(h.date)}</td>
                                        <td className="px-4 py-3 capitalize">{holidayType(h)}</td>
                                        <td className="px-4 py-3">{locationName(h.holiday_location_id) || 'All locations'}</td>
                                        <td className="px-4 py-3">{h.is_optional ? 'Optional' : 'Mandatory'}</td>
                                        <td className={`pl-4 ${LIST_EDGE_LAST} py-3`}>
                                            <div className="flex items-center justify-end gap-1.5">
                                                <Button variant="tonal" size="toolbar" icon={Edit2} onClick={() => openHolidayEdit(h)}>Edit</Button>
                                                <Button variant="danger" size="toolbar" icon={Trash2} aria-label={`Delete ${h.name}`} title="Delete" onClick={() => handleHolidayDelete(h.id)} />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </ListPage>

            {/* Location Modal */}
            <Modal
                open={showModal}
                onClose={closeModal}
                title={editingId ? 'Edit Location' : 'Add Location'}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Name *</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                            className="field"
                            placeholder="e.g., Head Office, Branch A"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Description</label>
                        <textarea
                            value={form.description}
                            onChange={e => setForm({ ...form, description: e.target.value })}
                            className="field"
                            rows={3}
                            placeholder="Location details..."
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
                        <Button variant="secondary" onClick={closeModal}>Cancel</Button>
                        <Button type="submit" icon={Save}>
                            {editingId ? 'Update' : 'Create'}
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Holiday Modal */}
            <Modal
                open={showHolidayModal}
                onClose={closeHolidayModal}
                title={editingHolidayId ? 'Edit Holiday' : 'Add Holiday'}
            >
                <form onSubmit={handleHolidaySubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Holiday Name *</label>
                        <input
                            type="text"
                            value={holidayForm.name}
                            onChange={e => setHolidayForm({ ...holidayForm, name: e.target.value })}
                            className="field"
                            required
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Date *</label>
                            <input
                                type="date"
                                value={holidayForm.date}
                                onChange={e => setHolidayForm({ ...holidayForm, date: e.target.value })}
                                className="field"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Type</label>
                            <select
                                value={holidayForm.holiday_type}
                                onChange={e => setHolidayForm({ ...holidayForm, holiday_type: e.target.value })}
                                className="field"
                            >
                                <option value="national">National</option>
                                <option value="regional">Regional</option>
                                <option value="company">Company</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Description</label>
                        <input
                            type="text"
                            value={holidayForm.description}
                            onChange={e => setHolidayForm({ ...holidayForm, description: e.target.value })}
                            className="field"
                        />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={holidayForm.is_optional}
                            onChange={e => setHolidayForm({ ...holidayForm, is_optional: e.target.checked })}
                            className="w-4 h-4 text-green-600 rounded"
                        />
                        <span className="text-sm">Optional Holiday (Restricted)</span>
                    </label>
                    <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
                        <Button variant="secondary" onClick={closeHolidayModal}>Cancel</Button>
                        <Button type="submit" icon={Save}>
                            {editingHolidayId ? 'Update' : 'Create'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
