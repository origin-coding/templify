<script setup lang="ts">
import { t } from '../utils/i18n';
import type { CollectionFieldDefinition } from '@templify/core';
import { useGenerationStore, initialValue } from '../stores/generation';
const store = useGenerationStore();
function items(field: CollectionFieldDefinition): Record<string, unknown>[] {
  return (store.current?.values[field.name] ?? []) as Record<string, unknown>[];
}
function update(container: Record<string, unknown>, name: string, value: unknown) {
  container[name] = value;
  store.invalidate();
}
function addItem(field: CollectionFieldDefinition) {
  items(field).push(
    Object.fromEntries(field.fields.map((child) => [child.name, initialValue(child)])),
  );
  store.invalidate();
}
function removeItem(field: CollectionFieldDefinition, index: number) {
  items(field).splice(index, 1);
  store.invalidate();
}
</script>

<template>
  <TRow :gutter="24" class="manual-layout">
    <TCol :xs="12" :sm="3" class="record-column"
      ><aside class="record-list">
        <div class="toolbar">
          <div class="actions">
            <strong>{{ t('recordCount', { count: store.count }) }}</strong
            ><TTooltip :content="t('recordHint')"
              ><button
                type="button"
                class="preview-help"
                :aria-label="t('recordHint')"
                :title="t('recordHint')"
              >
                ?
              </button></TTooltip
            >
          </div>
          <TButton size="small" variant="outline" @click="store.addRecord">{{ t('add') }}</TButton>
        </div>
        <div class="toolbar">
          <TButton
            variant="outline"
            :disabled="store.busy || !store.count"
            @click="store.previewPdf('all')"
            >{{ t('previewAllPdf') }}</TButton
          >
        </div>
        <div
          v-for="(record, index) in store.drafts"
          :key="record.id"
          class="record-entry"
          :class="{ selected: record.id === store.selectedId }"
        >
          <button class="record-select" @click="store.selectedId = record.id">
            {{ t('record', { index: index + 1 }) }}
          </button>
          <TButton
            size="small"
            variant="text"
            theme="danger"
            :aria-label="t('deleteRecord', { index: index + 1 })"
            @click="store.removeRecord(record.id)"
            >{{ t('delete') }}</TButton
          >
        </div>
      </aside></TCol
    >
    <TCol :xs="12" :sm="9" class="form-column">
      <div v-if="store.current" :key="store.current.id" class="field-list">
        <div class="record-heading toolbar wrap">
          <div>
            <h3>
              {{
                t('editRecord', {
                  index: store.drafts.findIndex((record) => record.id === store.selectedId) + 1,
                })
              }}
            </h3>
            <p class="muted">{{ t('autoSave') }}</p>
          </div>
          <TButton
            variant="outline"
            :disabled="store.busy"
            @click="
              store.previewPdf(store.drafts.findIndex((record) => record.id === store.selectedId))
            "
            >{{ t('previewCurrentPdf') }}</TButton
          >
        </div>
        <p v-if="!store.fields.length" class="muted">{{ t('noFields') }}</p>
        <template v-for="field in store.fields" :key="field.name">
          <ScalarInput
            v-if="field.kind === 'scalar'"
            :field="field"
            :value="store.current.values[field.name]"
            :id="`field-${field.name}`"
            @change="update(store.current!.values, field.name, $event)"
          />
          <section v-else class="collection-field">
            <div class="toolbar">
              <strong
                >{{ field.name }} · {{ t('itemCount', { count: items(field).length }) }}</strong
              ><TButton size="small" variant="outline" @click="addItem(field)">{{
                t('addItem')
              }}</TButton>
            </div>
            <p v-if="!items(field).length" class="muted">{{ t('noItems') }}</p>
            <div v-for="(item, index) in items(field)" :key="index" class="collection-item">
              <div class="toolbar">
                <strong>{{ t('item', { index: index + 1 }) }}</strong
                ><TButton
                  size="small"
                  theme="danger"
                  variant="text"
                  @click="removeItem(field, index)"
                  >{{ t('remove') }}</TButton
                >
              </div>
              <ScalarInput
                v-for="child in field.fields"
                :key="child.name"
                :field="child"
                :value="item[child.name]"
                :id="`field-${field.name}-${index}-${child.name}`"
                @change="update(item, child.name, $event)"
              />
            </div>
          </section>
        </template>
      </div>
      <div v-else class="empty-state">{{ t('addRecordHint') }}</div>
    </TCol>
  </TRow>
</template>
