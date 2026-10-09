// Hand-written response shapes. The web app never imports from ../src: the API's internal
// fields must not look public, and the packages stay independent. Each story adds the
// shapes it needs, next to its MSW handlers.

/** Body of a 400 from the API: `{ errors: { field: message } }`. */
export type FieldErrors = Record<string, string>;
