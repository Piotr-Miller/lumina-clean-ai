import { randomUUID } from "node:crypto";
import { renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

export interface FileReplacement {
  path: string;
  originalContents: string;
  nextContents: string;
}

export type AtomicWriter = (path: string, contents: string) => void;

function removeTemporaryFile(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
}

/**
 * Replace one file through a temporary sibling, so readers see either the old
 * contents or the complete new contents rather than a partially-written file.
 */
export function writeFileAtomically(path: string, contents: string): void {
  const temporaryPath = resolve(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  let renamed = false;

  try {
    writeFileSync(temporaryPath, contents, { encoding: "utf8", flag: "wx" });
    renameSync(temporaryPath, path);
    renamed = true;
  } finally {
    if (!renamed) removeTemporaryFile(temporaryPath);
  }
}

/**
 * Replace two related files. If the second replacement fails, restore the
 * first file atomically before surfacing the original error.
 */
export function writeFilePairAtomically(
  first: FileReplacement,
  second: FileReplacement,
  writeAtomically: AtomicWriter = writeFileAtomically,
): void {
  writeAtomically(first.path, first.nextContents);

  try {
    writeAtomically(second.path, second.nextContents);
  } catch (writeError) {
    try {
      writeAtomically(first.path, first.originalContents);
    } catch (rollbackError) {
      throw new AggregateError(
        [writeError, rollbackError],
        `Failed to replace ${second.path} and failed to restore ${first.path}.`,
      );
    }
    throw writeError;
  }
}
