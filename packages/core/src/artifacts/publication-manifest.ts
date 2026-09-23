import type { GenerationPlan } from '@/generation/generation-plan';
import type { PublishableArtifactKind } from './publishable-artifact';

export interface PublicationManifestItem {
  readonly artifactId: string;
  readonly kind: PublishableArtifactKind;
  readonly relativePath: string;
}

export interface PublicationManifest {
  readonly version: 1;
  readonly items: readonly PublicationManifestItem[];
}

export function derivePublicationManifest(plan: GenerationPlan): PublicationManifest {
  if (plan.bundle.kind === 'zip') {
    return {
      version: 1,
      items: [{ artifactId: 'bundle:zip', kind: 'zip', relativePath: plan.bundle.fileName }],
    };
  }
  return { version: 1, items: deriveUnbundledManifestItems(plan) };
}

export function deriveUnbundledManifestItems(
  plan: GenerationPlan,
): readonly PublicationManifestItem[] {
  const items: PublicationManifestItem[] = [];
  for (const document of plan.documents) {
    if (plan.documentOutputs !== 'pdf') {
      items.push({
        artifactId: `${document.documentId}:docx`,
        kind: 'docx',
        relativePath: document.docxPath,
      });
    }
    if (plan.documentOutputs !== 'docx') {
      items.push({
        artifactId: `${document.documentId}:pdf`,
        kind: 'pdf',
        relativePath: replaceExtension(document.docxPath, '.pdf'),
      });
    }
  }
  for (const aggregate of plan.aggregates) {
    items.push({
      artifactId: `${aggregate.aggregateId}:pdf`,
      kind: 'merged-pdf',
      relativePath: aggregate.relativePath,
    });
  }
  return items;
}

function replaceExtension(path: string, extension: string): string {
  return `${path.slice(0, path.lastIndexOf('.'))}${extension}`;
}
