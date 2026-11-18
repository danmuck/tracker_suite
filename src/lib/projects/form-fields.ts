// What a Projects form sends for an optional text field. Pure: no framework, browser or server imports.

/**
 * An empty field is left out of the request (`undefined`), which the API reads as "keep". When the
 * field had a value when the form opened (editing), "" is sent instead so the API clears it.
 */
export function optionalField(value: string, before: string | null | undefined): string | undefined {
  return value || (before ? "" : undefined);
}
