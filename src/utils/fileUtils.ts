/** Makes a notebook title safe to use as a file name on every OS. */
export const sanitizeFileName = (name: string, fallback = 'notebook'): string => {
    const cleaned = name
        // eslint-disable-next-line no-control-regex
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        // Windows does not allow trailing dots or spaces
        .replace(/[. ]+$/, '')
        .slice(0, 100);
    return cleaned || fallback;
};

export const downloadBlob = (filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Give the browser a moment to start the download before the URL is released
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadJsonFile = (filename: string, data: unknown) => {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const base = sanitizeFileName(filename.replace(/\.json$/i, ''));
    downloadBlob(`${base}.json`, blob);
};
