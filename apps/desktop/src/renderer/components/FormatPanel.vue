<script setup lang="ts">
import type {
  FieldFormat,
  FieldFormatRule,
  FieldPath,
  RenderDefaults,
  RenderOptions,
} from '@templify/core';
import { usePreferencesStore } from '../stores/preferences';
import { useGenerationStore } from '../stores/generation';
import { t } from '../utils/i18n';
import { issueMessage, issueLocation } from '../utils/diagnostics';
const props = defineProps<{ scope: 'defaults' | 'fields' }>();
const emit = defineEmits<{ saved: [] }>();
const preferences = usePreferencesStore();
const store = useGenerationStore();
const types = ['boolean', 'date', 'datetime', 'number'] as const;
type FormatType = (typeof types)[number];
const entries = computed(() =>
  props.scope === 'defaults'
    ? types.map((type) => ({ path: [type] as FieldPath, type }))
    : store.fields
        .flatMap((field) =>
          field.kind === 'scalar'
            ? [{ path: [field.name] as FieldPath, type: field.hint.type }]
            : field.fields.map((child) => ({
                path: [field.name, child.name] as FieldPath,
                type: child.hint.type,
              })),
        )
        .filter((entry): entry is { path: FieldPath; type: FormatType } =>
          types.includes(entry.type as FormatType),
        ),
);
const key = (path: readonly string[]) => JSON.stringify(path);
const draft = ref<Record<string, FieldFormat>>({});
for (const entry of entries.value) {
  const format =
    props.scope === 'defaults'
      ? preferences.renderDefaults[entry.type]
      : store.formats.find((rule) => key(rule.path) === key(entry.path))?.format;
  if (format) draft.value[key(entry.path)] = { ...format, type: entry.type } as FieldFormat;
}
function toggle(entry: { path: FieldPath; type: FormatType }, enabled: boolean) {
  const id = key(entry.path);
  if (!enabled) {
    delete draft.value[id];
    return;
  }
  const inherited = props.scope === 'fields' ? preferences.renderDefaults[entry.type] : undefined;
  draft.value[id] = {
    ...(entry.type === 'boolean' ? { trueText: 'true', falseText: 'false' } : {}),
    ...inherited,
    type: entry.type,
  } as FieldFormat;
}
const options = computed<RenderOptions>(() => {
  if (props.scope === 'fields')
    return {
      formats: entries.value.flatMap((entry) =>
        draft.value[key(entry.path)]
          ? [{ path: entry.path, format: draft.value[key(entry.path)]! } as FieldFormatRule]
          : [],
      ),
    };
  const defaults: Record<string, unknown> = {};
  for (const entry of entries.value) {
    const format = draft.value[key(entry.path)];
    if (format) {
      const { type: _type, ...settings } = format;
      defaults[entry.type] = settings;
    }
  }
  return { defaults: defaults as RenderDefaults };
});
const examples = ref<readonly { path: readonly string[]; text: string }[]>([]);
const error = ref('');
const checking = ref(true);
const saving = ref(false);
const saved = ref(false);
let revision = 0;
watch(
  options,
  async (value) => {
    const current = ++revision;
    checking.value = true;
    saved.value = false;
    try {
      const result = await window.templify.formatExamples(
        JSON.parse(JSON.stringify(value)),
        props.scope === 'fields',
      );
      if (current !== revision) return;
      error.value =
        result.status === 'error'
          ? result.issues
              .map((issue) =>
                [issueMessage(issue), issueLocation(issue), String(issue.data?.reason ?? '')]
                  .filter(Boolean)
                  .join(' · '),
              )
              .join('；')
          : '';
      examples.value = result.status === 'ok' ? result.value : [];
    } catch {
      if (current === revision) error.value = t('InvalidRenderOptions');
    } finally {
      if (current === revision) checking.value = false;
    }
  },
  { immediate: true, deep: true },
);
async function save() {
  if (checking.value || error.value || store.busy) return;
  saving.value = true;
  try {
    if (props.scope === 'defaults') {
      await preferences.setRenderDefaults(options.value.defaults ?? {});
      if (preferences.error) return;
    } else store.setFormats(options.value.formats ?? []);
    saved.value = true;
    emit('saved');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="format-panel" :class="`format-panel--${scope}`">
    <p class="muted">{{ t(scope === 'defaults' ? 'formatDefaultsHint' : 'formatFieldsHint') }}</p>
    <p v-if="!entries.length" class="muted">{{ t('formatNoFields') }}</p>
    <div v-if="entries.length" class="format-entries">
      <table class="format-table">
        <colgroup>
          <col class="format-label-column" />
          <col class="format-settings-column" />
          <col class="format-example-column" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">{{ t(scope === 'defaults' ? 'formatType' : 'formatField') }}</th>
            <th scope="col">{{ t('formatSettings') }}</th>
            <th scope="col">{{ t('formatExample') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in entries" :key="key(entry.path)" class="format-entry">
            <th scope="row">
              <strong>{{
                scope === 'defaults'
                  ? t(
                      entry.type === 'boolean'
                        ? 'formatBoolean'
                        : entry.type === 'number'
                          ? 'formatNumber'
                          : entry.type === 'date'
                            ? 'formatDate'
                            : 'formatDatetime',
                    )
                  : entry.path.join(' / ')
              }}</strong>
            </th>
            <td>
              <div class="format-choice">
                <TCheckbox :checked="!!draft[key(entry.path)]" @change="toggle(entry, $event)">{{
                  t('formatCustom')
                }}</TCheckbox>
                <span v-if="!draft[key(entry.path)]" class="muted">{{
                  t(scope === 'defaults' ? 'formatBuiltin' : 'formatAppDefault')
                }}</span>
              </div>
              <FormatControls
                v-if="draft[key(entry.path)]"
                :model-value="draft[key(entry.path)]!"
                @update:model-value="draft[key(entry.path)] = $event"
              />
            </td>
            <td class="muted format-example">
              {{ examples.find((example) => key(example.path) === key(entry.path))?.text ?? '…' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <TAlert v-if="error" theme="error">{{ error }}</TAlert>
    <div class="toolbar wrap format-save">
      <TButton
        theme="primary"
        :loading="saving"
        :disabled="checking || !!error || store.busy || preferences.saving"
        @click="save"
        >{{ t('formatApply') }}</TButton
      >
      <span v-if="saved" class="muted" role="status">{{ t('formatSaved') }}</span>
    </div>
  </div>
</template>
