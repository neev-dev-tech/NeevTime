import api from '../api';

/**
 * Fetch one employee document and save it.
 *
 * The document lists carry no file content (they used to hand every ID proof
 * on file to anyone who could open the page); the file is fetched only when
 * someone asks for it, and only admin and HR may.
 */
export async function downloadEmployeeDoc(doc) {
    const res = await api.get(`/api/employee-docs/file/${doc.id}`);
    const { data, file_type: type, doc_name: name } = res.data;
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: type || 'application/octet-stream' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name || doc.doc_name || 'document';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
