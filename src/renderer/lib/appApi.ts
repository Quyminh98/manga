// Thin typed accessor around window.appApi (exposed by src/preload/index.ts).
// Renderer code should import `appApi` from here instead of touching
// `window.appApi` directly, so call sites stay agnostic of the global.

export const appApi = window.appApi
