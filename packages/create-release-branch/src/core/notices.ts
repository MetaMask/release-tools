/**
 * A warning that the core prints once, with the items it applies to, such as
 * package names.
 *
 * @property title - What happened.
 * @property items - What it happened to.
 */
export type Notice = { title: string; items: string[] };
