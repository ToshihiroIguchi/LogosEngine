/*
 * Makes the page cross-origin isolated on hosts that cannot send COOP/COEP headers
 * (for example GitHub Pages). Isolation enables SharedArrayBuffer, which LogosEngine uses to
 * interrupt running Python code without restarting the engine. Without it the engine still
 * works; Stop then falls back to restarting it.
 *
 * Based on the approach of coi-serviceworker (MIT): re-serve every response with
 * COOP: same-origin and COEP: credentialless.
 */
if (typeof window === 'undefined') {
    self.addEventListener('install', () => self.skipWaiting());
    self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener('fetch', (event) => {
        const request = event.request;
        // Chrome bug: only-if-cached requests must be same-origin
        if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Opaque responses cannot be re-wrapped
                    if (response.status === 0) return response;
                    const headers = new Headers(response.headers);
                    headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
                    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers,
                    });
                })
                .catch((error) => {
                    console.error('coi-serviceworker fetch failed:', error);
                    return Response.error();
                })
        );
    });
}
