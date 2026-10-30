import { isAbsolute, resolve, relative, sep } from "node:path";

/** Private runtime data must live outside the source tree and public assets. */
export function privateDirectory(value: string | undefined, label: string, projectRoot = process.cwd()) {
  if (!value || !isAbsolute(value)) throw new Error(`${label} requiere un directorio absoluto privado y persistente.`);
  const directory = resolve(/* turbopackIgnore: true */ value), root = resolve(/* turbopackIgnore: true */ projectRoot);
  const inside = (parent: string, candidate: string) => {
    const rel = relative(parent, candidate);
    return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
  };
  if (inside(root, directory) || inside(directory, root)) throw new Error(`${label} debe estar fuera del proyecto y de sus recursos públicos.`);
  return directory;
}
