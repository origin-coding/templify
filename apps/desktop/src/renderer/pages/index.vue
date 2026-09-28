<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type {
  CollectionFieldDefinition,
  FieldDefinition,
  ScalarFieldDefinition,
} from '@templify/core';
import type { DesktopIssue, GeneratedDocument, InspectedTemplate } from '../../shared/desktop-api';

const template = ref<InspectedTemplate>();
const values = reactive<Record<string, unknown>>({});
const overwrite = ref(false);
const working = ref(false);
const issue = ref<DesktopIssue>();
const generated = ref<GeneratedDocument>();

const fields = computed(() => template.value?.definition.fields ?? []);
const canGenerate = computed(() => template.value !== undefined && !working.value);

async function chooseTemplate() {
  issue.value = undefined;
  generated.value = undefined;
  working.value = true;
  try {
    const result = await window.templify.selectTemplate();
    if (result.status === 'error') {
      issue.value = result.issue;
    } else if (result.status === 'ok') {
      template.value = result.value;
      for (const key of Object.keys(values)) delete values[key];
      for (const field of result.value.definition.fields)
        values[field.name] = field.kind === 'collection' ? [] : initialValue(field);
    }
  } catch (error) {
    issue.value = unexpectedIssue(error);
  } finally {
    working.value = false;
  }
}

async function generate() {
  if (!canGenerate.value) return;
  issue.value = undefined;
  generated.value = undefined;
  working.value = true;
  try {
    const result = await window.templify.generateDocument(createRecordSnapshot(), overwrite.value);
    if (result.status === 'error') issue.value = result.issue;
    else if (result.status === 'ok') generated.value = result.value;
  } catch (error) {
    issue.value = unexpectedIssue(error);
  } finally {
    working.value = false;
  }
}

function createRecordSnapshot(): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const field of fields.value) {
    if (field.kind === 'scalar') {
      record[field.name] = values[field.name];
    } else {
      record[field.name] = collectionItems(field).map((item) =>
        Object.fromEntries(field.fields.map((child) => [child.name, item[child.name]])),
      );
    }
  }
  return record;
}

function initialValue(field: ScalarFieldDefinition): string | boolean {
  return field.hint.type === 'boolean' ? false : '';
}

function inputValue(container: Record<string, unknown>, name: string): string {
  const value = container[name];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function collectionItems(field: CollectionFieldDefinition): Record<string, unknown>[] {
  return values[field.name] as Record<string, unknown>[];
}

function addCollectionItem(field: CollectionFieldDefinition) {
  collectionItems(field).push(
    Object.fromEntries(field.fields.map((item) => [item.name, initialValue(item)])),
  );
}

function removeCollectionItem(field: CollectionFieldDefinition, index: number) {
  collectionItems(field).splice(index, 1);
}

function labelFor(field: FieldDefinition): string {
  if (field.kind === 'collection') return '列表';
  if (field.hint.type === 'option') return '选项';
  return {
    string: '文本',
    number: '数字',
    boolean: '是/否',
    date: '日期',
    datetime: '日期时间',
  }[field.hint.type];
}

function unexpectedIssue(cause: unknown): DesktopIssue {
  return {
    stage: 'desktop',
    code: 'UnexpectedFailure',
    details: cause instanceof Error ? cause.message : String(cause),
  };
}
</script>

<template>
  <main class="desktop-shell">
    <header class="page-header">
      <div>
        <div class="eyebrow">DOCUMENT GENERATOR</div>
        <h1>Templify</h1>
        <p>选择 Word 模板，填写一条记录，生成可直接使用的 DOCX 文档。</p>
      </div>
      <TTag theme="primary" variant="light">本地处理</TTag>
    </header>

    <div class="workflow">
      <TCard class="panel" title="1 · 选择模板" :bordered="true">
        <div class="template-row">
          <div class="template-info">
            <strong>{{ template ? template.path.split(/[\\/]/).at(-1) : '尚未选择模板' }}</strong>
            <span v-if="template" class="path-text">{{ template.path }}</span>
            <span v-else>支持带有 Templify 字段标签的 .docx 文件</span>
          </div>
          <TButton theme="primary" :loading="working" @click="chooseTemplate">
            {{ template ? '更换模板' : '选择 DOCX' }}
          </TButton>
        </div>
      </TCard>

      <TCard class="panel" title="2 · 填写记录" :bordered="true">
        <div v-if="!template" class="empty-state">选择模板后，这里会显示需要填写的字段。</div>
        <div v-else-if="fields.length === 0" class="empty-state">
          这个模板没有可填写字段。仍可生成一份 DOCX。
        </div>
        <div v-else class="field-list">
          <template v-for="field in fields" :key="field.name">
            <div v-if="field.kind === 'scalar'" class="field-row">
              <label :for="`field-${field.name}`">
                <strong>{{ field.name }}</strong>
                <span>{{ labelFor(field) }}</span>
              </label>
              <input
                v-if="field.hint.type === 'boolean'"
                :id="`field-${field.name}`"
                type="checkbox"
                :checked="Boolean(values[field.name])"
                @change="values[field.name] = ($event.target as HTMLInputElement).checked"
              />
              <select
                v-else-if="field.hint.type === 'option'"
                :id="`field-${field.name}`"
                :value="inputValue(values, field.name)"
                @change="values[field.name] = ($event.target as HTMLSelectElement).value"
              >
                <option value="">请选择</option>
                <option v-for="option in field.hint.values" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>
              <input
                v-else
                :id="`field-${field.name}`"
                :type="
                  field.hint.type === 'number'
                    ? 'number'
                    : field.hint.type === 'date'
                      ? 'date'
                      : field.hint.type === 'datetime'
                        ? 'datetime-local'
                        : 'text'
                "
                :step="field.hint.type === 'number' ? 'any' : undefined"
                :value="inputValue(values, field.name)"
                @input="values[field.name] = ($event.target as HTMLInputElement).value"
              />
            </div>
            <div v-else class="collection-field">
              <div class="collection-heading">
                <div>
                  <strong>{{ field.name }}</strong
                  ><span>列表 · {{ field.fields.length }} 个字段</span>
                </div>
                <TButton size="small" variant="outline" @click="addCollectionItem(field)"
                  >添加一项</TButton
                >
              </div>
              <div v-if="collectionItems(field).length === 0" class="collection-empty">
                暂无项目
              </div>
              <div
                v-for="(item, index) in collectionItems(field)"
                :key="index"
                class="collection-item"
              >
                <div class="collection-item-heading">
                  <strong>第 {{ index + 1 }} 项</strong>
                  <TButton
                    size="small"
                    variant="text"
                    theme="danger"
                    @click="removeCollectionItem(field, index)"
                    >移除</TButton
                  >
                </div>
                <div v-for="child in field.fields" :key="child.name" class="field-row nested">
                  <label :for="`field-${field.name}-${index}-${child.name}`">
                    <strong>{{ child.name }}</strong
                    ><span>{{ labelFor(child) }}</span>
                  </label>
                  <input
                    v-if="child.hint.type === 'boolean'"
                    :id="`field-${field.name}-${index}-${child.name}`"
                    type="checkbox"
                    :checked="Boolean(item[child.name])"
                    @change="item[child.name] = ($event.target as HTMLInputElement).checked"
                  />
                  <select
                    v-else-if="child.hint.type === 'option'"
                    :id="`field-${field.name}-${index}-${child.name}`"
                    :value="inputValue(item, child.name)"
                    @change="item[child.name] = ($event.target as HTMLSelectElement).value"
                  >
                    <option value="">请选择</option>
                    <option v-for="option in child.hint.values" :key="option" :value="option">
                      {{ option }}
                    </option>
                  </select>
                  <input
                    v-else
                    :id="`field-${field.name}-${index}-${child.name}`"
                    :type="
                      child.hint.type === 'number'
                        ? 'number'
                        : child.hint.type === 'date'
                          ? 'date'
                          : child.hint.type === 'datetime'
                            ? 'datetime-local'
                            : 'text'
                    "
                    :step="child.hint.type === 'number' ? 'any' : undefined"
                    :value="inputValue(item, child.name)"
                    @input="item[child.name] = ($event.target as HTMLInputElement).value"
                  />
                </div>
              </div>
            </div>
          </template>
        </div>
      </TCard>

      <TCard class="panel" title="3 · 生成文档" :bordered="true">
        <div class="generate-row">
          <label class="overwrite-option">
            <input v-model="overwrite" type="checkbox" />
            允许覆盖已有文件
          </label>
          <TButton theme="primary" :disabled="!canGenerate" :loading="working" @click="generate">
            选择保存位置并生成
          </TButton>
        </div>
        <TAlert v-if="issue" theme="error" class="feedback">
          {{ issue.code }}（{{ issue.stage }}）<span v-if="issue.details"
            >：{{ issue.details }}</span
          >
        </TAlert>
        <TAlert v-if="generated" theme="success" class="feedback">
          {{ generated.replacedExisting ? '已覆盖' : '已生成' }}：{{ generated.path }}
        </TAlert>
      </TCard>
    </div>
  </main>
</template>
