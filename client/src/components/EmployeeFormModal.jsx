import React, { useState, useEffect } from 'react';
import { X, User, Camera } from 'lucide-react';
import Button from './ui/Button';
import api from '../api';

export default function EmployeeFormModal({ isOpen, onClose, employee = null, departments = [], positions = [], areas = [], onSave }) {
    const isEdit = !!employee;
    const [activeTab, setActiveTab] = useState('personal');
    const [shifts, setShifts] = useState([]);

    useEffect(() => {
        if (!isOpen) return;
        api.get('/api/shifts')
            .then(res => setShifts(res.data || []))
            .catch(() => setShifts([]));
    }, [isOpen]);

    const [formData, setFormData] = useState({
        // Profile
        employee_code: employee?.employee_code || '',
        name: employee?.name || '',
        last_name: employee?.last_name || '',
        department_id: employee?.department_id || '',
        position_id: employee?.position_id || '',
        area_id: employee?.area_id || '',
        employment_type: employee?.employment_type || '',
        date_of_joining: employee?.date_of_joining || '',
        holiday_location_id: employee?.holiday_location_id || '',
        outdoor_mng: employee?.outdoor_mng || false,
        photo_url: employee?.photo_url || '',

        // Personal Info
        aadhaar_no: employee?.aadhaar_no || '',
        nick_name: employee?.nick_name || '',
        gender: employee?.gender || '',
        passport_no: employee?.passport_no || '',
        mobile: employee?.mobile || '',
        motorcycle_license: employee?.motorcycle_license || '',
        contact_no: employee?.contact_no || '',
        office_tel: employee?.office_tel || '',
        automobile_license: employee?.automobile_license || '',
        card_number: employee?.card_number || '',
        religion: employee?.religion || '',
        city: employee?.city || '',
        permanent_address: employee?.permanent_address || '',
        pincode: employee?.pincode || '',
        email: employee?.email || '',
        birthday: employee?.birthday || '',
        nationality: employee?.nationality || '',

        // Device Settings
        device_privilege: employee?.device_privilege || 'Employee',
        has_fingerprint: employee?.has_fingerprint || false,
        has_face: employee?.has_face || false,
        has_palm: employee?.has_palm || false,

        // Attendance Settings
        attendance_required: employee?.attendance_required ?? true,
        exclude_from_hrms: employee?.exclude_from_hrms ?? false,
        overtime_allowed: employee?.overtime_allowed || false,
        default_shift_id: employee?.default_shift_id || '',
        week_off_days: employee?.week_off_days || 'Sun,Sat',

        // Mobile App Settings
        app_login_enabled: employee?.app_login_enabled || false,
        geo_fencing: employee?.geo_fencing || false,
        selfie_punch: employee?.selfie_punch || false,

        // WhatsApp/SMS Settings
        whatsapp_enabled: employee?.whatsapp_enabled || false,
        whatsapp_number: employee?.whatsapp_number || '',
        sms_enabled: employee?.sms_enabled || false,
        sms_number: employee?.sms_number || '',
    });

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    const tabs = [
        { id: 'personal', label: 'Personal Information' },
        { id: 'device', label: 'Device Settings' },
        { id: 'attendance', label: 'Attendance Settings' },
        { id: 'mobile', label: 'Mobile App Settings' },
        { id: 'whatsapp', label: 'WhatsApp Settings' },
        { id: 'sms', label: 'SMS Settings' }
    ];

    const InputField = ({ label, required, value, onChange, type = 'text', options, placeholder }) => (
        <div className="flex items-center gap-2">
            <label className="w-36 text-right text-slate-600 dark:text-slate-400 text-sm whitespace-nowrap">
                {label}{required && <span className="text-red-500">*</span>}:
            </label>
            {options ? (
                <select
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className="field-sm flex-1"
                >
                    <option value="">----------</option>
                    {options.map(opt => <option key={opt.value || opt} value={opt.value || opt}>{opt.label || opt}</option>)}
                </select>
            ) : (
                <input
                    type={type}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="field-sm flex-1"
                />
            )}
        </div>
    );

    const Toggle = ({ label, checked, onChange }) => (
        <div className="flex items-center gap-2">
            <label className="w-44 text-right text-slate-600 dark:text-slate-400 text-sm">{label}:</label>
            <label className="flex items-center gap-2">
                <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="rounded" />
                <span className="text-sm text-slate-600 dark:text-slate-400">Enable</span>
            </label>
        </div>
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{isEdit ? 'Edit Employee' : 'Add Employee'}</h2>
                    <Button variant="ghost" size="sm" icon={X} onClick={onClose} aria-label="Close" />
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                    <div className="p-6">
                        {/* Profile Section */}
                        <div className="mb-6">
                            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4 pb-2 border-b dark:border-slate-700">Profile</h3>
                            <div className="flex gap-8">
                                {/* Form Fields - Left */}
                                <div className="flex-1 grid grid-cols-2 gap-4">
                                    <InputField label="Employee Id" required value={formData.employee_code} onChange={v => handleChange('employee_code', v)} placeholder="e.g. EMP001" />
                                    <InputField label="First Name" required value={formData.name} onChange={v => handleChange('name', v)} />
                                    <InputField label="Department" required value={formData.department_id} onChange={v => handleChange('department_id', v)}
                                        options={departments.map(d => ({ value: d.id, label: d.name || d.department_name }))} />
                                    <InputField label="Last Name" value={formData.last_name} onChange={v => handleChange('last_name', v)} />
                                    <InputField label="Position" required value={formData.position_id} onChange={v => handleChange('position_id', v)}
                                        options={positions.map(p => ({ value: p.id, label: p.name || p.position_name }))} />
                                    <InputField label="Area" required value={formData.area_id} onChange={v => handleChange('area_id', v)}
                                        options={areas.map(a => ({ value: a.id, label: a.name || a.area_name }))} />
                                    <InputField label="Employment Type" value={formData.employment_type} onChange={v => handleChange('employment_type', v)}
                                        options={['Full-time', 'Part-time', 'Contract', 'Intern']} />
                                    <InputField label="Date of Joining" value={formData.date_of_joining} onChange={v => handleChange('date_of_joining', v)} type="date" />
                                </div>

                                {/* Photo Upload - Right */}
                                <div className="flex-shrink-0">
                                    <div className="w-32 h-40 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                                        {formData.photo_url ? (
                                            <img src={formData.photo_url} alt="Employee" className="w-full h-full object-cover rounded" />
                                        ) : (
                                            <>
                                                <User size={48} className="text-slate-300 mb-2" />
                                                <span className="text-xs text-slate-400">Photo</span>
                                            </>
                                        )}
                                    </div>
                                    {/* Photos are read from photo_url; there is no upload endpoint,
                                        so the field is edited rather than a file being posted. */}
                                    <label className="mt-2 block text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 text-center">
                                        <Camera size={12} className="inline mr-1" /> Photo URL
                                    </label>
                                    <input
                                        type="url"
                                        value={formData.photo_url || ''}
                                        onChange={e => handleChange('photo_url', e.target.value)}
                                        placeholder="https://…"
                                        className="field-sm mt-1 w-32"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="border-b dark:border-slate-700 mb-4">
                            <div className="flex gap-1 overflow-x-auto">
                                {tabs.map(tab => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === tab.id
                                                ? 'text-green-600 dark:text-green-300 border-green-600'
                                                : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                                            }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Tab Content */}
                        {activeTab === 'personal' && (
                            <div className="grid grid-cols-3 gap-4">
                                <InputField label="Aadhaar No." value={formData.aadhaar_no} onChange={v => handleChange('aadhaar_no', v)} />
                                <InputField label="Nick Name" value={formData.nick_name} onChange={v => handleChange('nick_name', v)} />
                                <InputField label="Gender" value={formData.gender} onChange={v => handleChange('gender', v)} options={['Male', 'Female', 'Other']} />
                                <InputField label="Passport No." value={formData.passport_no} onChange={v => handleChange('passport_no', v)} />
                                <InputField label="Mobile" value={formData.mobile} onChange={v => handleChange('mobile', v)} />
                                <InputField label="Motorcycle License" value={formData.motorcycle_license} onChange={v => handleChange('motorcycle_license', v)} />
                                <InputField label="Contact no." value={formData.contact_no} onChange={v => handleChange('contact_no', v)} />
                                <InputField label="Office Tel" value={formData.office_tel} onChange={v => handleChange('office_tel', v)} />
                                <InputField label="Automobile License" value={formData.automobile_license} onChange={v => handleChange('automobile_license', v)} />
                                <InputField label="Card No." value={formData.card_number} onChange={v => handleChange('card_number', v)} />
                                <InputField label="Religion" value={formData.religion} onChange={v => handleChange('religion', v)} />
                                <InputField label="City" value={formData.city} onChange={v => handleChange('city', v)} />
                                <InputField label="Email" value={formData.email} onChange={v => handleChange('email', v)} type="email" />
                                <InputField label="Birthday" value={formData.birthday} onChange={v => handleChange('birthday', v)} type="date" />
                                <InputField label="Nationality" value={formData.nationality} onChange={v => handleChange('nationality', v)} />
                                <div className="col-span-2">
                                    <div className="flex items-start gap-2">
                                        <label className="w-36 text-right text-slate-600 dark:text-slate-400 text-sm pt-1.5">Permanent Address:</label>
                                        <textarea
                                            value={formData.permanent_address}
                                            onChange={e => handleChange('permanent_address', e.target.value)}
                                            rows={2}
                                            className="field-sm flex-1 resize-none"
                                        />
                                    </div>
                                </div>
                                <InputField label="Pincode" value={formData.pincode} onChange={v => handleChange('pincode', v)} />
                            </div>
                        )}

                        {activeTab === 'device' && (
                            <div className="space-y-4">
                                <InputField label="Device Privilege" value={formData.device_privilege} onChange={v => handleChange('device_privilege', v)}
                                    options={['Employee', 'Administrator', 'Super Administrator']} />
                                {/* Enrolment is captured on the reader itself — the finger, face
                                    or palm has to be presented to the hardware. This panel reports
                                    what the devices have sent back. */}
                                <div className="mt-6 ml-40 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                                    <p className="text-xs text-amber-800 dark:text-amber-300">
                                        Biometrics are enrolled at the device. Register the employee on
                                        a reader, and the status below updates on the next device sync.
                                    </p>
                                </div>
                                <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded ml-40">
                                    <div className="grid grid-cols-3 gap-4 text-sm">
                                        <div><span className="text-slate-500 dark:text-slate-400">Fingerprint:</span> <span className={formData.has_fingerprint ? 'text-green-600 dark:text-green-300' : 'text-slate-400'}>{formData.has_fingerprint ? 'Enrolled' : 'Not enrolled'}</span></div>
                                        <div><span className="text-slate-500 dark:text-slate-400">Face:</span> <span className={formData.has_face ? 'text-green-600 dark:text-green-300' : 'text-slate-400'}>{formData.has_face ? 'Enrolled' : 'Not enrolled'}</span></div>
                                        <div><span className="text-slate-500 dark:text-slate-400">Palm:</span> <span className={formData.has_palm ? 'text-green-600 dark:text-green-300' : 'text-slate-400'}>{formData.has_palm ? 'Enrolled' : 'Not enrolled'}</span></div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'attendance' && (
                            <div className="space-y-4">
                                <Toggle label="Attendance Required" checked={formData.attendance_required} onChange={v => handleChange('attendance_required', v)} />
                                <Toggle label="Overtime Allowed" checked={formData.overtime_allowed} onChange={v => handleChange('overtime_allowed', v)} />
                                {/* Facility and security contractors hold biometric access but do
                                    not exist in the HR system. Without this their punches are
                                    pushed, rejected, and retried on every sync cycle. */}
                                <Toggle
                                    label="Exclude from HRMS sync"
                                    checked={formData.exclude_from_hrms}
                                    onChange={v => handleChange('exclude_from_hrms', v)}
                                />
                                <p className="ml-40 -mt-2 text-xs text-slate-500 dark:text-slate-400">
                                    For people with door access who are not on the HR system —
                                    contractors, security, facility staff. Attendance is still
                                    recorded here, it is just never sent to ERPNext.
                                </p>
                                <div className="flex items-center gap-2">
                                    <label className="w-44 text-right text-slate-600 dark:text-slate-400 text-sm">Default Shift:</label>
                                    <select
                                        value={formData.default_shift_id || ''}
                                        onChange={e => handleChange('default_shift_id', e.target.value)}
                                        className="field-sm flex-1 max-w-xs"
                                    >
                                        <option value="">----------</option>
                                        {shifts.map(shift => (
                                            <option key={shift.id} value={shift.id}>
                                                {shift.name}
                                                {shift.start_time && shift.end_time
                                                    ? ` (${String(shift.start_time).slice(0, 5)} - ${String(shift.end_time).slice(0, 5)})`
                                                    : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="w-44 text-right text-slate-600 dark:text-slate-400 text-sm">Week Off:</label>
                                    <div className="flex gap-2">
                                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                                            <label key={day} className="flex items-center gap-1">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.week_off_days.includes(day)}
                                                    onChange={e => {
                                                        const days = formData.week_off_days.split(',').filter(d => d);
                                                        if (e.target.checked) {
                                                            handleChange('week_off_days', [...days, day].join(','));
                                                        } else {
                                                            handleChange('week_off_days', days.filter(d => d !== day).join(','));
                                                        }
                                                    }}
                                                    className="rounded"
                                                />
                                                <span className="text-xs text-slate-600 dark:text-slate-400">{day}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'mobile' && (
                            <div className="space-y-4">
                                <Toggle label="App Access" checked={formData.app_login_enabled} onChange={v => handleChange('app_login_enabled', v)} />
                                <Toggle label="Geo-fencing" checked={formData.geo_fencing} onChange={v => handleChange('geo_fencing', v)} />
                                <Toggle label="Selfie Punch" checked={formData.selfie_punch} onChange={v => handleChange('selfie_punch', v)} />
                            </div>
                        )}

                        {activeTab === 'whatsapp' && (
                            <div className="space-y-4">
                                <Toggle label="WhatsApp Notifications" checked={formData.whatsapp_enabled} onChange={v => handleChange('whatsapp_enabled', v)} />
                                <div className="flex items-center gap-2">
                                    <label className="w-44 text-right text-slate-600 dark:text-slate-400 text-sm">WhatsApp Number:</label>
                                    <input
                                        type="tel"
                                        value={formData.whatsapp_number}
                                        onChange={e => handleChange('whatsapp_number', e.target.value)}
                                        className="field-sm flex-1 max-w-xs"
                                        placeholder="+91"
                                    />
                                </div>
                            </div>
                        )}

                        {activeTab === 'sms' && (
                            <div className="space-y-4">
                                <Toggle label="SMS Notifications" checked={formData.sms_enabled} onChange={v => handleChange('sms_enabled', v)} />
                                <div className="flex items-center gap-2">
                                    <label className="w-44 text-right text-slate-600 dark:text-slate-400 text-sm">SMS Number:</label>
                                    <input
                                        type="tel"
                                        value={formData.sms_number}
                                        onChange={e => handleChange('sms_number', e.target.value)}
                                        className="field-sm flex-1 max-w-xs"
                                        placeholder="+91"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end gap-3 p-4 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                        <Button type="submit" variant="primary">
                            Confirm
                        </Button>
                        <Button type="button" variant="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
