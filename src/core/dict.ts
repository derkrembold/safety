/**
 * Dictionaries keyed by identifiers that come from a project file.
 *
 * Ids are arbitrary strings after an import, so `__proto__` is a possible key. On an
 * ordinary object literal, `dict[id] = value` with that key hits the inherited setter
 * and changes the prototype instead of adding an entry — the entry is silently lost.
 * Reading `dict[id]` has the mirror problem and hands back `Object.prototype`.
 *
 * Every id-keyed dictionary in the model is therefore created without a prototype, and
 * every lookup by id goes through {@link dictGet} / {@link dictHas}.
 */

/** A dictionary without a prototype, safe to assign arbitrary ids into. */
export function emptyDict<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>
}

/** Copies entries into a fresh prototype-free dictionary. */
export function dictFrom<T>(...sources: Readonly<Record<string, T>>[]): Record<string, T> {
  return Object.assign(emptyDict<T>(), ...sources) as Record<string, T>
}

/** Looks up an own entry; never returns something inherited from a prototype. */
export function dictGet<T>(dict: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : undefined
}

/** True when the dictionary has an own entry under this key. */
export function dictHas<T>(dict: Readonly<Record<string, T>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(dict, key)
}

/** Returns a copy without the given key. */
export function dictOmit<T>(
  dict: Readonly<Record<string, T>>,
  key: string,
): Record<string, T> {
  const next = dictFrom(dict)
  delete next[key]
  return next
}
