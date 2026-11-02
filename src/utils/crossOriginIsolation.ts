/**
 * Cross-origin isolation (needed for SharedArrayBuffer, i.e. interrupting code without losing
 * variables). Servers that send COOP/COEP headers are enough; otherwise a service worker adds
 * them and the page reloads once so that it is served through the worker.
 */
const RELOAD_FLAG = 'logos-engine-coi-reload';
const MAX_WAIT_MS = 4000;

export async function ensureCrossOriginIsolation(): Promise<void> {
    if (globalThis.crossOriginIsolated) return;
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

    // One reload per tab session, so a host that blocks isolation cannot cause a reload loop
    let alreadyReloaded = false;
    try {
        alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1';
    } catch {
        alreadyReloaded = true;
    }
    if (alreadyReloaded) return;

    const reloadOnce = () => {
        try {
            sessionStorage.setItem(RELOAD_FLAG, '1');
        } catch {
            return;
        }
        window.location.reload();
    };

    try {
        const scriptUrl = new URL(`${import.meta.env.BASE_URL}coi-serviceworker.js`, window.location.href).href;
        const registration = await navigator.serviceWorker.register(scriptUrl);

        if (navigator.serviceWorker.controller) {
            // Controlled but not isolated: the worker's headers are not being applied
            return;
        }

        if (!registration) return;
        await new Promise<void>((resolve) => {
            const onControllerChange = () => {
                clearTimeout(timer);
                reloadOnce();
                resolve();
            };
            // Past the deadline the app starts as it is; never reload under a user who is already typing
            const timer = setTimeout(() => {
                navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
                resolve();
            }, MAX_WAIT_MS);
            navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, { once: true });
        });
    } catch (err) {
        console.warn('Cross-origin isolation is unavailable:', err);
    }
}
