/** localStorage that never throws (private mode, blocked site data, quota). */
export const safeStorage = {
    get(key: string): string | null {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    },
    set(key: string, value: string): void {
        try {
            localStorage.setItem(key, value);
        } catch {
            // ignore: the value just will not persist
        }
    },
    remove(key: string): void {
        try {
            localStorage.removeItem(key);
        } catch {
            // ignore
        }
    }
};
