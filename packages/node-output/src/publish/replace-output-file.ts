import { rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export interface ReplacementState {
  readonly destinationPath: string;
  readonly backupPath?: string;
  installed: boolean;
}

export class ReplacementFailure extends Error {
  readonly state: ReplacementState;
  constructor(state: ReplacementState, cause: unknown) {
    super('Output replacement failed.', { cause });
    this.name = new.target.name;
    this.state = state;
  }
}

export async function replaceOutputFile(
  temporaryPath: string,
  destinationPath: string,
  replaceExisting: boolean,
): Promise<ReplacementState> {
  if (!replaceExisting) {
    await rename(temporaryPath, destinationPath);
    return { destinationPath, installed: true };
  }
  const backupPath = path.join(path.dirname(destinationPath), `.templify-backup-${randomUUID()}`);
  await rename(destinationPath, backupPath);
  const state: ReplacementState = { destinationPath, backupPath, installed: false };
  try {
    await rename(temporaryPath, destinationPath);
    state.installed = true;
    return state;
  } catch (cause) {
    throw new ReplacementFailure(state, cause);
  }
}
