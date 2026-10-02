<script setup lang="ts">
import { currentLocale, t } from '../utils/i18n';
import type { CollectionFieldDefinition, RecordData } from '@templify/core';
import { useGenerationStore } from '../stores/generation';
const store = useGenerationStore();
const page = ref(1);
const expanded = ref<number>();
const active = ref('');
const childPage = ref(1);
const collections = computed(() =>
  store.fields.filter((field): field is CollectionFieldDefinition => field.kind === 'collection'),
);
const records = computed(() => store.imported?.records ?? []);
const visible = computed(() => records.value.slice((page.value - 1) * 10, page.value * 10));
function children(record: RecordData, name: string) {
  const value = record[name];
  return Array.isArray(value) ? value : [];
}
function display(value: unknown, type?: string): string {
  if (value instanceof Date)
    return type === 'date'
      ? value.toISOString().slice(0, 10)
      : value.toLocaleString(currentLocale(), { hour12: false });
  return value === null || value === undefined ? '' : String(value);
}
function expand(index: number, name: string) {
  if (expanded.value === index && active.value === name) {
    expanded.value = undefined;
    return;
  }
  expanded.value = index;
  active.value = name;
  childPage.value = 1;
}
function sourceLabel(index: number) {
  const origin = store.imported?.origins[index];
  return [
    origin?.sheetName,
    origin?.sourceRowNumber ? t('row', { row: origin.sourceRowNumber }) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
</script>

<template>
  <div class="table-scroll">
    <table class="preview-table">
      <thead>
        <tr>
          <th>{{ t('recordSource') }}</th>
          <th v-for="field in store.fields" :key="field.name">{{ field.name }}</th>
          <th>{{ t('pdfPreviewTitle') }}</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(record, offset) in visible" :key="offset">
          <tr>
            <td>
              {{ t('record', { index: (page - 1) * 10 + offset + 1 })
              }}<small>{{ sourceLabel((page - 1) * 10 + offset) }}</small>
            </td>
            <td v-for="field in store.fields" :key="field.name">
              <template v-if="field.kind === 'collection'">
                <TButton
                  v-if="children(record, field.name).length"
                  size="small"
                  variant="text"
                  :aria-expanded="expanded === (page - 1) * 10 + offset && active === field.name"
                  @click="expand((page - 1) * 10 + offset, field.name)"
                  >{{
                    t('collectionCount', { count: children(record, field.name).length })
                  }}</TButton
                >
                <span v-else class="muted">{{ t('collectionCount', { count: 0 }) }}</span>
              </template>
              <span v-else>{{ display(record[field.name], field.hint.type) }}</span>
            </td>
            <td>
              <TButton
                size="small"
                variant="text"
                :disabled="store.busy"
                @click="store.previewPdf((page - 1) * 10 + offset)"
                >{{ t('previewCurrentPdf') }}</TButton
              >
            </td>
          </tr>
          <tr v-if="expanded === (page - 1) * 10 + offset">
            <td :colspan="store.fields.length + 2" class="expanded-cell">
              <TTabs
                :value="active"
                @change="
                  active = String($event);
                  childPage = 1;
                "
              >
                <TTabPanel
                  v-for="collection in collections"
                  :key="collection.name"
                  :value="collection.name"
                  :label="`${collection.name} (${children(record, collection.name).length})`"
                >
                  <div class="table-scroll">
                    <table class="preview-table child-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th v-for="child in collection.fields" :key="child.name">
                            {{ child.name }}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="(item, index) in children(record, collection.name).slice(
                            (childPage - 1) * 10,
                            childPage * 10,
                          )"
                          :key="index"
                        >
                          <td>{{ (childPage - 1) * 10 + index + 1 }}</td>
                          <td v-for="child in collection.fields" :key="child.name">
                            {{ display(item[child.name], child.hint.type) }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p v-if="!children(record, collection.name).length" class="muted">
                    {{ t('emptyCollection') }}
                  </p>
                  <TPagination
                    v-if="children(record, collection.name).length > 10"
                    :current="childPage"
                    :page-size="10"
                    :total="children(record, collection.name).length"
                    :show-page-size="false"
                    @current-change="childPage = $event"
                  />
                </TTabPanel>
              </TTabs>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
  <TPagination
    v-if="records.length > 10"
    :current="page"
    :page-size="10"
    :total="records.length"
    :show-page-size="false"
    @current-change="
      page = $event;
      expanded = undefined;
    "
  />
</template>
