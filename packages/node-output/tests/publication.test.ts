import { link, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PublicationManifest, PublishableArtifactSet } from '@templify/core';
import { createPublicationPlan, preflightPublication, publishArtifacts } from '@/index';

const roots: string[] = [];
const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function manifest(relativePath = 'nested/result.docx'): PublicationManifest {
  return { version: 1, items: [{ artifactId: 'document-0:docx', kind: 'docx', relativePath }] };
}
function artifacts(relativePath = 'nested/result.docx', value = 'new'): PublishableArtifactSet {
  return {
    artifacts: [{ artifactId: 'document-0:docx', kind: 'docx', relativePath, bytes: bytes(value) }],
  };
}
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'templify-node-output-'));
  roots.push(root);
  return root;
}

describe('node output publication', () => {
  it('rejects traversal while creating the pure publication plan', async () => {
    const root = await temporaryRoot();
    expect(
      createPublicationPlan({ rootDirectory: root, manifest: manifest('../escape.docx') }),
    ).toEqual({
      ok: false,
      errors: [{ code: 'UnsafeOutputPath', relativePath: '../escape.docx' }],
      warnings: [],
    });
  });

  it('preflights and publishes nested files', async () => {
    const root = await temporaryRoot();
    const planned = createPublicationPlan({ rootDirectory: root, manifest: manifest() });
    if (!planned.ok) throw new Error('plan failed');
    const preflighted = await preflightPublication(planned.value);
    expect(preflighted.ok).toBe(true);
    if (!preflighted.ok) return;
    expect(preflighted.value.items[0]!.action).toBe('create');
    expect((await publishArtifacts(preflighted.value, artifacts())).ok).toBe(true);
    expect(await readFile(path.join(root, 'nested', 'result.docx'), 'utf8')).toBe('new');
  });

  it('requires explicit overwrite and replaces through a temporary backup', async () => {
    const root = await temporaryRoot();
    const target = path.join(root, 'result.docx');
    await writeFile(target, 'old');
    const rejectedPlan = createPublicationPlan({
      rootDirectory: root,
      manifest: manifest('result.docx'),
    });
    if (!rejectedPlan.ok) throw new Error('plan failed');
    const rejected = await preflightPublication(rejectedPlan.value);
    expect(rejected).toMatchObject({ ok: false, errors: [{ code: 'OutputConflict' }] });

    const overwritePlan = createPublicationPlan({
      rootDirectory: root,
      manifest: manifest('result.docx'),
      conflictPolicy: 'overwrite',
    });
    if (!overwritePlan.ok) throw new Error('plan failed');
    const preflighted = await preflightPublication(overwritePlan.value);
    if (!preflighted.ok) throw new Error(JSON.stringify(preflighted.errors));
    expect((await publishArtifacts(preflighted.value, artifacts('result.docx'))).ok).toBe(true);
    expect(await readFile(target, 'utf8')).toBe('new');
  });

  it('refuses to publish when a target changes after preflight', async () => {
    const root = await temporaryRoot();
    const planned = createPublicationPlan({
      rootDirectory: root,
      manifest: manifest('result.docx'),
    });
    if (!planned.ok) throw new Error('plan failed');
    const preflighted = await preflightPublication(planned.value);
    if (!preflighted.ok) throw new Error('preflight failed');
    await writeFile(path.join(root, 'result.docx'), 'raced');
    const published = await publishArtifacts(preflighted.value, artifacts('result.docx'));
    expect(published).toMatchObject({
      ok: false,
      errors: [{ code: 'OutputChangedAfterPreflight' }],
    });
    expect(await readFile(path.join(root, 'result.docx'), 'utf8')).toBe('raced');
  });

  it('protects the source template path from being used as an output', async () => {
    const root = await temporaryRoot();
    const source = path.join(root, 'template.docx');
    await writeFile(source, 'template');
    const planned = createPublicationPlan({
      rootDirectory: root,
      manifest: manifest('template.docx'),
      conflictPolicy: 'overwrite',
      protectedPaths: [source],
    });
    if (!planned.ok) throw new Error('plan failed');
    const preflighted = await preflightPublication(planned.value);
    expect(preflighted).toMatchObject({
      ok: false,
      errors: [{ code: 'OutputSameAsProtectedPath' }],
    });
  });

  it('protects a hard link to the source template', async () => {
    const root = await temporaryRoot();
    const source = path.join(root, 'template.docx');
    const alias = path.join(root, 'alias.docx');
    await writeFile(source, 'template');
    await link(source, alias);
    const planned = createPublicationPlan({
      rootDirectory: root,
      manifest: manifest('alias.docx'),
      conflictPolicy: 'overwrite',
      protectedPaths: [source],
    });
    if (!planned.ok) throw new Error('plan failed');
    expect(await preflightPublication(planned.value)).toMatchObject({
      ok: false,
      errors: [{ code: 'OutputSameAsProtectedPath' }],
    });
  });
});
