import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Button from './ui/Button';
import Modal from './Modal';
import { toLocalDateString } from '../utils/dateFormat';

export default function ResignationModal({ isOpen, onClose, selectedCount, onConfirm }) {
    const today = toLocalDateString();

    const [formData, setFormData] = useState({
        resignation_date: today,
        resignation_type: 'Quit',
        report_end_date: today,
        attendance_enabled: 'Disable',
        reason_enabled: 'Disable',
        reason: ''
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        onConfirm(formData);
    };

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Resignation"
            size="lg"
        >
            <form onSubmit={handleSubmit}>
                <div className="space-y-5">
                    {selectedCount > 1 && (
                        <div className="flex items-start gap-3 p-3 bg-orange-50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 rounded-lg text-sm border border-orange-100 dark:border-orange-800">
                            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                            <p>You are applying resignation for <strong>{selectedCount}</strong> employees. All of them will share these details.</p>
                        </div>
                    )}

                    {/* Resignation Date */}
                    <div className="grid grid-cols-3 gap-4 items-center">
                        <label className="text-sm font-medium text-slate-grey dark:text-slate-400 text-right">Resignation Date<span className="text-red-500">*</span>:</label>
                        <div className="col-span-2 relative">
                            <input
                                type="date"
                                required
                                value={formData.resignation_date}
                                onChange={e => setFormData({ ...formData, resignation_date: e.target.value })}
                                className="input-base w-full"
                            />
                        </div>
                    </div>

                    {/* Resignation Type */}
                    <div className="grid grid-cols-3 gap-4 items-center">
                        <label className="text-sm font-medium text-slate-grey dark:text-slate-400 text-right">Resignation Type<span className="text-red-500">*</span>:</label>
                        <div className="col-span-2">
                            <select
                                className="input-base w-full"
                                value={formData.resignation_type}
                                onChange={e => setFormData({ ...formData, resignation_type: e.target.value })}
                            >
                                <option value="Quit">Quit</option>
                                <option value="Terminated">Terminated</option>
                                <option value="Absconded">Absconded</option>
                                <option value="Retired">Retired</option>
                                <option value="Death">Death</option>
                            </select>
                        </div>
                    </div>

                    {/* Report Generation End Date */}
                    <div className="grid grid-cols-3 gap-4 items-center">
                        <label className="text-sm font-medium text-slate-grey dark:text-slate-400 text-right">Report Generation End Date<span className="text-red-500">*</span>:</label>
                        <div className="col-span-2">
                            <input
                                type="date"
                                required
                                value={formData.report_end_date}
                                onChange={e => setFormData({ ...formData, report_end_date: e.target.value })}
                                className="input-base w-full"
                            />
                        </div>
                    </div>

                    {/* Attendance */}
                    <div className="grid grid-cols-3 gap-4 items-center">
                        <label className="text-sm font-medium text-slate-grey dark:text-slate-400 text-right">Attendance<span className="text-red-500">*</span>:</label>
                        <div className="col-span-2">
                            <select
                                className="input-base w-full"
                                value={formData.attendance_enabled}
                                onChange={e => setFormData({ ...formData, attendance_enabled: e.target.value })}
                            >
                                <option value="Disable">Disable</option>
                                <option value="Enable">Enable</option>
                            </select>
                        </div>
                    </div>

                    {/* Resign Reason */}
                    <div className="grid grid-cols-3 gap-4 items-start">
                        <label className="text-sm font-medium text-slate-grey dark:text-slate-400 text-right pt-2">Resign Reason:</label>
                        <div className="col-span-2">
                            <textarea
                                rows={4}
                                className="input-base w-full resize-none"
                                value={formData.reason}
                                onChange={e => setFormData({ ...formData, reason: e.target.value })}
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-100 dark:border-slate-700">
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary">
                        Confirm
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
