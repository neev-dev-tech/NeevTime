import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
// Aliased deliberately: importing it as `Image` would shadow the global Image
// constructor that downscale() relies on, and every upload would fail with a
// confusing error about a React component not being a constructor.
import { Upload, Trash2, Image as ImageIcon, AlertCircle } from 'lucide-react';

/**
 * Company logo picker.
 *
 * The setting has always existed — seeded as an empty string described as
 * "Logo URL or base64" — but rendered as a plain text box, so branding the app
 * meant pasting a base64 blob by hand. Nobody was ever going to do that.
 *
 * The image is stored in the setting itself as a data URI rather than on disk.
 * That is a deliberate trade: this deployment runs in a container that is
 * rebuilt on every deploy, so a file written to the filesystem disappears,
 * while a settings row survives and is included in the database backup. The
 * cost is that the value travels with every settings fetch, which is why the
 * image is downscaled hard before it is stored.
 */

const MAX_EDGE = 512;          // plenty for a header logo at 2x
const MAX_STORED_BYTES = 400 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/**
 * Shrink to fit MAX_EDGE and re-encode, preserving transparency for PNG.
 * SVG is passed through untouched — rasterising it would throw away the one
 * format that stays sharp at any size.
 */
const downscale = (file) => new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read that file'));
        reader.readAsDataURL(file);
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));

            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, w, h);

            // PNG keeps transparency, which matters on a dark header. JPEG is
            // only used when the source had no alpha channel to lose.
            const asPng = canvas.toDataURL('image/png');
            const asJpeg = canvas.toDataURL('image/jpeg', 0.9);
            const hadAlpha = file.type === 'image/png' || file.type === 'image/webp';
            resolve(hadAlpha || asPng.length <= asJpeg.length ? asPng : asJpeg);
        };
        img.onerror = () => reject(new Error('That file is not a readable image'));
        img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
});

export default function LogoUpload({ value, onChange, label = 'Company Logo', description }) {
    const inputRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const pick = async (file) => {
        setError(null);
        if (!file) return;

        if (!ACCEPTED.includes(file.type)) {
            setError('Use a PNG, JPG, WEBP or SVG file.');
            return;
        }

        setBusy(true);
        try {
            const dataUri = await downscale(file);
            // Checked after downscaling, not before: a 4MB photograph shrinks
            // to well under the limit, and rejecting it on its original size
            // would be refusing a file that is actually fine.
            if (dataUri.length > MAX_STORED_BYTES) {
                setError('That image is still too large after resizing. Try a simpler logo, ideally a PNG or SVG.');
                return;
            }
            onChange(dataUri);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const hasLogo = typeof value === 'string' && value.trim() !== '';

    return (
        <div className="space-y-2 md:col-span-2">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">{label}</label>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50">
                <div className="flex items-start gap-4 flex-wrap">
                    {/* Checkerboard shows transparency honestly, so a logo with a
                        white box around it is obvious here rather than a surprise
                        on the dark header. */}
                    <div
                        className="w-28 h-28 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0"
                        style={{
                            backgroundImage:
                                'linear-gradient(45deg,#e2e8f0 25%,transparent 25%),linear-gradient(-45deg,#e2e8f0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e8f0 75%),linear-gradient(-45deg,transparent 75%,#e2e8f0 75%)',
                            backgroundSize: '12px 12px',
                            backgroundPosition: '0 0,0 6px,6px -6px,-6px 0px',
                            backgroundColor: '#f8fafc'
                        }}
                    >
                        {hasLogo ? (
                            <img src={value} alt="Company logo" className="max-w-full max-h-full object-contain" />
                        ) : (
                            <ImageIcon size={26} className="text-slate-300 dark:text-slate-600" />
                        )}
                    </div>

                    <div className="flex-1 min-w-[220px] space-y-2">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            {description || 'Appears on the sign-in page, in the app header and on exported PDF reports.'}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                            PNG, JPG, WEBP or SVG. Resized to {MAX_EDGE}px automatically — a transparent PNG
                            or an SVG looks best on both light and dark backgrounds.
                        </p>

                        <div className="flex gap-2 flex-wrap pt-1">
                            <button
                                type="button"
                                onClick={() => inputRef.current?.click()}
                                disabled={busy}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-slate-500 hover:bg-slate-600 text-white disabled:opacity-60 dark:bg-slate-600 dark:hover:bg-slate-500"
                            >
                                <Upload size={15} />
                                {busy ? 'Processing…' : hasLogo ? 'Replace' : 'Upload logo'}
                            </button>

                            {hasLogo && (
                                <button
                                    type="button"
                                    onClick={() => { setError(null); onChange(''); }}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-900/30 dark:hover:bg-rose-900/50 dark:text-rose-300 dark:border-rose-800"
                                >
                                    <Trash2 size={15} />
                                    Remove
                                </button>
                            )}
                        </div>

                        {error && (
                            <p className="flex items-start gap-1.5 text-xs text-rose-600 dark:text-rose-400 pt-1">
                                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                                {error}
                            </p>
                        )}

                        {hasLogo && !error && (
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-1">
                                Stored size ≈ {Math.round(value.length / 1024)} KB.
                                Remember to press Save Changes.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED.join(',')}
                onChange={(e) => pick(e.target.files?.[0])}
                className="hidden"
            />
        </div>
    );
}

LogoUpload.propTypes = {
    value: PropTypes.string,
    onChange: PropTypes.func.isRequired,
    label: PropTypes.string,
    description: PropTypes.string
};
