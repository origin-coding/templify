<script setup lang="ts">
import { t } from '../utils/i18n';
import { usePreferencesStore } from '../stores/preferences';
import { isLanguagePreference } from '../../shared/settings';
import { useGenerationStore } from '../stores/generation';
import { MessagePlugin, NotifyPlugin } from 'tdesign-vue-next';
import { issueMessage, issueLocation } from '../utils/diagnostics';
import desktopPackage from '../../../package.json';
import { readLocalFonts } from '../utils/local-fonts';
const store = useGenerationStore();
const aboutVisible = ref(false);
const settingsVisible = ref(false);
const formatsVisible = ref(false);
const preferences = usePreferencesStore();
watch(
  () => preferences.renderDefaults,
  () => store.invalidate(),
  { deep: true },
);
useHead(() => ({ htmlAttrs: { lang: preferences.locale } }));
function changeLanguage(value: unknown) {
  if (isLanguagePreference(value)) void preferences.setLanguage(value);
}
watch(
  () => store.feedback?.id,
  () => {
    const feedback = store.feedback;
    if (!feedback) return;
    if (feedback.kind === 'success')
      void MessagePlugin.success({ content: feedback.title, duration: 3000 });
    else
      void NotifyPlugin.error({
        title: feedback.title,
        content: feedback.issues
          .filter((issue) => issue.code !== 'PdfConversionLoss')
          .map((issue) => [issueMessage(issue), issueLocation(issue)].filter(Boolean).join(' · '))
          .join('；'),
        duration: 0,
        closeBtn: true,
        className: 'operation-notification',
      });
  },
);
function helpAction(option: { value?: unknown }) {
  if (option.value === 'about') aboutVisible.value = true;
  else if (option.value === 'docs') void store.openDocumentation();
}
let unsubscribe: (() => void) | undefined;
let unsubscribeFonts: (() => void) | undefined;
onMounted(() => {
  unsubscribe = window.templify.onPhase((value) => {
    if (store.busy) store.phase = value;
  });
  unsubscribeFonts = window.templify.onFontRequest(readLocalFonts);
});
onUnmounted(() => {
  unsubscribe?.();
  unsubscribeFonts?.();
});
const titles = computed(() => [t('selectTemplate'), t('prepareData'), t('configureOutput')]);
function stepStatus(index: number): 'default' | 'process' | 'finish' | 'error' {
  if (index === store.step) return store.issues.length ? 'error' : 'process';
  if (index < store.step) return 'finish';
  return 'default';
}
</script>

<template>
  <TLayout class="desktop-shell">
    <THeader class="page-header">
      <div>
        <h1>Templify</h1>
        <p>{{ t('subtitle') }}</p>
      </div>
      <div class="actions">
        <TButton variant="text" :disabled="store.busy" @click="settingsVisible = true">{{
          t('settings')
        }}</TButton>
        <TDropdown
          trigger="click"
          placement="bottom-right"
          :min-column-width="190"
          :max-column-width="280"
          :options="[
            { content: t('docs'), value: 'docs' },
            { content: t('about'), value: 'about' },
          ]"
          @click="helpAction"
        >
          <TButton variant="text">{{ t('help') }} ▾</TButton>
        </TDropdown>
      </div>
    </THeader>
    <TContent class="workflow-content">
      <TSteps :current="store.step" class="steps" @change="store.go(Number($event))">
        <TStepItem
          v-for="(title, index) in titles"
          :key="title"
          :title="title"
          :status="stepStatus(index)"
          :disabled="
            store.busy ||
            index > store.reached ||
            (index > 0 && !store.template) ||
            (index === 2 && !store.count)
          "
        />
      </TSteps>
      <TCard class="panel" :title="titles[store.step]">
        <fieldset :disabled="store.busy" :class="{ locked: store.busy }">
          <template v-if="store.step === 0">
            <div class="template-row">
              <div class="template-info">
                <strong>{{ store.template?.path.split(/[\\/]/).at(-1) ?? t('noTemplate') }}</strong
                ><span class="path-text">{{ store.template?.path ?? t('templateHint') }}</span>
              </div>
              <TButton theme="primary" @click="store.chooseTemplate">{{
                store.template ? t('replaceTemplate') : t('selectDocx')
              }}</TButton>
            </div>
            <p v-if="store.template" class="muted">
              {{
                t('templateSummary', {
                  scalar: store.fields.filter((field) => field.kind === 'scalar').length,
                  collections: store.fields.filter((field) => field.kind === 'collection').length,
                })
              }}
            </p>
          </template>
          <template v-else-if="store.step === 1">
            <div class="input-method-toolbar">
              <TRadioGroup
                :value="store.mode"
                class="input-mode"
                @change="store.switchMode($event === 'file' ? 'file' : 'manual')"
                ><TRadioButton value="manual">{{ t('manualInput') }}</TRadioButton
                ><TRadioButton value="file">Excel / CSV</TRadioButton></TRadioGroup
              >
              <TTooltip :content="t('switchHint')" trigger="hover"
                ><button
                  type="button"
                  class="preview-help"
                  :aria-label="t('switchHint')"
                  :title="t('switchHint')"
                >
                  ?
                </button></TTooltip
              >
            </div>
            <div class="toolbar format-task-entry">
              <TButton variant="outline" @click="formatsVisible = true">{{
                t('formatFields')
              }}</TButton>
            </div>
            <ManualRecords v-if="store.mode === 'manual'" />
            <FileRecords v-else />
          </template>
          <OutputStep v-else />
        </fieldset>
        <DiagnosticsPanel />
      </TCard>
    </TContent>
    <TFooter class="workflow-footer">
      <TButton
        variant="outline"
        :disabled="store.busy || store.step === 0"
        @click="store.go(store.step - 1)"
        >{{ t('previous') }}</TButton
      >
      <span v-if="store.busy" role="status">{{ store.phase }}…</span>
      <span v-else class="muted">{{ t('stepCount', { step: store.step + 1 }) }}</span>
      <TButton
        v-if="store.step < 2"
        theme="primary"
        :loading="store.busy"
        :disabled="!store.template || (store.step === 1 && !store.count)"
        @click="store.go(store.step + 1)"
        >{{ t('next') }}</TButton
      >
      <TButton
        v-else
        theme="primary"
        :loading="store.busy"
        :disabled="!store.output.destination || store.busy"
        @click="store.generate"
        >{{ t('generate') }}</TButton
      >
    </TFooter>
  </TLayout>
  <PdfPreviewDialog />
  <TDialog
    v-model:visible="formatsVisible"
    :header="t('formatFields')"
    :footer="false"
    width="min(720px, calc(100vw - 48px))"
    placement="top"
    top="24px"
    destroy-on-close
    ><FormatPanel v-if="formatsVisible" scope="fields"
  /></TDialog>
  <TDialog v-model:visible="aboutVisible" :header="t('about')" :footer="false" width="420px">
    <p>Templify {{ desktopPackage.version }}</p>
    <p class="muted">{{ t('aboutDescription') }}</p>
    <TButton variant="text" @click="store.openDocumentation">{{ t('projectDocs') }} ↗</TButton>
  </TDialog>
  <TDialog
    v-model:visible="settingsVisible"
    :header="t('settings')"
    :footer="false"
    width="min(720px, calc(100vw - 48px))"
    placement="top"
    top="24px"
    destroy-on-close
  >
    <label class="settings-language"
      >{{ t('language')
      }}<TSelect
        :value="preferences.language"
        :disabled="preferences.saving || store.busy"
        :options="[
          { label: t('followSystem'), value: 'system' },
          { label: '简体中文', value: 'zh-CN' },
          { label: 'English', value: 'en-US' },
        ]"
        @change="changeLanguage"
    /></label>
    <p class="muted">{{ t('settingsHint') }}</p>
    <h3>{{ t('formatDefaults') }}</h3>
    <FormatPanel v-if="settingsVisible" scope="defaults" />
    <TAlert v-if="preferences.error" theme="warning">{{ t(preferences.error) }}</TAlert>
  </TDialog>
</template>
