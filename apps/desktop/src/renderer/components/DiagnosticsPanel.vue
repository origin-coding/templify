<script setup lang="ts">
import { t } from '../utils/i18n';
import { issueMessage, issueLocation } from '../utils/diagnostics';
import type { DesktopIssue } from '../../shared/desktop-api';
import { useGenerationStore } from '../stores/generation';
const store = useGenerationStore();
function recordIndex(issue: DesktopIssue): number | undefined {
  const loc = issue.data?.location as { inputRowIndex?: number } | undefined;
  return (
    loc?.inputRowIndex ??
    (typeof issue.data?.recordIndex === 'number' ? issue.data.recordIndex : undefined)
  );
}
async function locate(issue: DesktopIssue) {
  const index = recordIndex(issue);
  const record = index === undefined ? undefined : store.drafts[index];
  if (!record) return;
  await store.go(1);
  store.selectedId = record.id;
  await nextTick();
  const loc = issue.data?.location as { path?: (string | number)[] } | undefined;
  const field = loc?.path?.join('-') ?? issue.data?.fieldName;
  if (field) {
    const element = document.getElementById(`field-${field}`);
    (element?.querySelector<HTMLElement>('input,button') ?? element)?.focus();
    element?.scrollIntoView({ block: 'center' });
  }
}
</script>

<template>
  <div class="diagnostics" aria-live="polite">
    <div
      v-for="(issue, index) in [...store.issues, ...store.warnings]"
      :key="index"
      class="diagnostic"
    >
      <TAlert :theme="index < store.issues.length ? 'error' : 'warning'">
        {{ issueMessage(issue)
        }}<span v-if="issueLocation(issue)"> · {{ issueLocation(issue) }}</span>
        <TButton
          v-if="store.mode === 'manual' && recordIndex(issue) !== undefined"
          size="small"
          variant="text"
          @click="locate(issue)"
          >{{ t('locate') }}</TButton
        >
      </TAlert>
    </div>
  </div>
</template>
