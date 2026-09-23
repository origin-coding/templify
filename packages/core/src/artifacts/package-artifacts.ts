import PizZip from 'pizzip';

import type { GeneratedArtifactSet } from './generated-artifact';
import type { ArtifactPackagingError } from './artifact-diagnostics';
import { deriveUnbundledManifestItems } from './publication-manifest';
import type { PublishableArtifactSet } from './publishable-artifact';
import type { GenerationPlan } from '@/generation/generation-plan';
import type { StageResult } from '@/stage-result';

export function packageArtifacts(
  plan: GenerationPlan,
  generated: GeneratedArtifactSet,
): StageResult<PublishableArtifactSet, ArtifactPackagingError> {
  const expected = deriveUnbundledManifestItems(plan);
  const byId = new Map<string, (typeof generated.artifacts)[number]>();
  for (const artifact of generated.artifacts) {
    if (byId.has(artifact.artifactId)) {
      return failure({ code: 'DuplicateGeneratedArtifact', artifactId: artifact.artifactId });
    }
    byId.set(artifact.artifactId, artifact);
  }
  if (byId.size !== expected.length) {
    const unexpected = generated.artifacts.find(
      (artifact) => !expected.some((item) => item.artifactId === artifact.artifactId),
    );
    const missing = expected.find((item) => !byId.has(item.artifactId));
    return failure({
      code: 'ArtifactSetMismatch',
      artifactId: unexpected?.artifactId ?? missing?.artifactId ?? '<unknown>',
    });
  }
  const ordered = [];
  for (const item of expected) {
    const artifact = byId.get(item.artifactId);
    if (
      artifact === undefined ||
      artifact.kind !== item.kind ||
      artifact.relativePath !== item.relativePath
    ) {
      return failure({ code: 'ArtifactSetMismatch', artifactId: item.artifactId });
    }
    ordered.push(artifact);
  }
  if (plan.bundle.kind === 'individual-files') {
    return { ok: true, value: { artifacts: ordered }, warnings: [] };
  }
  try {
    const zip = new PizZip();
    for (const artifact of ordered) zip.file(artifact.relativePath, artifact.bytes);
    return {
      ok: true,
      value: {
        artifacts: [
          {
            artifactId: 'bundle:zip',
            kind: 'zip',
            relativePath: plan.bundle.fileName,
            bytes: zip.generate({ type: 'uint8array' }),
          },
        ],
      },
      warnings: [],
    };
  } catch {
    return failure({ code: 'ArchivePackagingFailed' });
  }
}

function failure(error: ArtifactPackagingError): StageResult<never, ArtifactPackagingError> {
  return { ok: false, errors: [error], warnings: [] };
}
