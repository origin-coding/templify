import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { DocumentWorkflow } from '../src/main/document-workflow';
import type { DesktopApi } from '../src/shared/desktop-api';
import { createDocx } from '../../../packages/core/tests/docx-fixture';
import { createXlsx } from '../../../packages/tabular-input/tests/xlsx-fixture';

// Runs the packaged renderer and real preload/core in a hidden Electron window.
app.disableHardwareAcceleration();
void app
  .whenReady()
  .then(verify)
  .catch((cause) => {
    console.error(cause);
    app.exit(1);
  });
async function verify() {
  Menu.setApplicationMenu(null);
  const root = await mkdtemp(path.join(os.tmpdir(), 'templify-ui-'));
  const screenshots = path.resolve('.desktop/qa/screenshots');
  await mkdir(screenshots, { recursive: true });
  const workflow = new DocumentWorkflow();
  const window = new BrowserWindow({
    show: false,
    width: 1100,
    height: 780,
    webPreferences: {
      preload: path.resolve('.desktop/preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  let selectedFile = path.join(root, 'template.docx');
  let selectedOutput = path.join(root, 'output.zip');
  let openedFile: string | undefined;
  let openError = '';
  shell.openPath = async (filePath) => {
    openedFile = filePath;
    return openError;
  };
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedFile] });
  dialog.showSaveDialog = async () => ({
    canceled: false,
    filePath: selectedOutput,
  });
  const handlers: Omit<DesktopApi, 'onPhase'> = {
    getSettings: async () => ({ language: 'system', systemLocale: 'zh-CN' }),
    setLanguage: async (language) => ({
      status: 'ok',
      value: { language, systemLocale: 'zh-CN' },
      warnings: [],
    }),
    selectTemplate: () => workflow.selectTemplate(window),
    importRecords: (options, reuse) => workflow.importRecords(window, options, reuse),
    exportExcel: () => workflow.exportExcel(window),
    openExcelTemplate: () => workflow.openExcelTemplate(),
    openDocumentation: () => workflow.openDocumentation(),
    validateRecords: (records) => workflow.validateRecords(records),
    selectOutput: (mode) => workflow.selectOutput(window, mode),
    previewOutput: (records, settings) => workflow.previewOutput(records, settings),
    generate: (id) => workflow.generate(window, id),
    openOutput: () => workflow.openOutput(),
    resetInput: () => workflow.resetInput(),
    invalidateOutput: () => workflow.invalidateOutput(),
    reset: () => workflow.reset(),
  };
  for (const [name, handler] of Object.entries(handlers)) {
    ipcMain.handle(`templify:${name}`, (_event, ...args: unknown[]) =>
      (handler as (...args: unknown[]) => unknown)(...args),
    );
  }
  const errors: string[] = [];
  window.webContents.on('console-message', (details) => {
    if (details.level === 'error') errors.push(details.message);
  });
  async function evaluate<T>(script: string): Promise<T> {
    return window.webContents.executeJavaScript(script);
  }
  async function ready() {
    await evaluate(`new Promise(resolve => setTimeout(resolve, 100))`);
  }
  async function screenshot(name: string) {
    const [width = 1100, height = 780] = window.getContentSize();
    window.setContentSize(width + 1, height);
    await ready();
    window.setContentSize(width, height);
    await ready();
    await writeFile(
      path.join(screenshots, `${name}.png`),
      (await window.webContents.capturePage()).toPNG(),
    );
    const dimensions = await evaluate<{ client: number; scroll: number }>(
      `({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth })`,
    );
    assert.ok(
      dimensions.scroll <= dimensions.client,
      `Horizontal overflow at ${name}: ${JSON.stringify(dimensions)}`,
    );
  }
  async function resize(width: number, height: number) {
    window.setContentSize(width, height);
    await ready();
  }

  try {
    await writeFile(
      selectedFile,
      createDocx([
        ['{name}'],
        ['{amount:number}'],
        ['{enabled:boolean}'],
        ['{day:date}'],
        ['{created:datetime}'],
        ['{department:option["Engineering","Office"]}'],
        ['{#items}'],
        ['{label}'],
        ['{/items}'],
        ['{#payments}'],
        ['{value:number}'],
        ['{/payments}'],
      ]),
    );
    await window.loadFile(path.resolve('.desktop/renderer/index.html'));
    await ready();
    // Hidden windows pause animation frames; keep transitions deterministic for UI checks.
    await evaluate(`(() => {
      window.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 16);
      const style = document.createElement('style');
      style.textContent = '* { animation-duration: 0s !important; transition-duration: 0s !important; }';
      document.head.append(style);
    })()`);
    await evaluate(
      `void (window.testStore = document.getElementById('__nuxt').__vue_app__.config.globalProperties.$pinia._s.get('generation'))`,
    );
    await evaluate(
      `void (window.testPrefs = document.getElementById('__nuxt').__vue_app__.config.globalProperties.$pinia._s.get('preferences'))`,
    );
    assert.equal(await evaluate(`typeof window.templify.importRecords`), 'function');
    await screenshot('template-1100');
    assert.equal(Menu.getApplicationMenu(), null);
    await resize(1600, 900);
    await screenshot('template-1600');
    assert.equal(
      await evaluate(`getComputedStyle(document.querySelector('.desktop-shell')).paddingLeft`),
      '32px',
    );
    await evaluate(
      `Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('帮助')).click()`,
    );
    await ready();
    await evaluate(
      `Array.from(document.querySelectorAll('.t-dropdown__item')).find(item => item.textContent.includes('关于 Templify')).click()`,
    );
    await ready();
    assert.ok(await evaluate(`document.body.textContent.includes('项目文档与源代码')`));
    await screenshot('about-1600');
    await evaluate(
      `Array.from(document.querySelectorAll('.t-dialog')).find(dialog => dialog.textContent.includes('关于 Templify')).querySelector('.t-dialog__close').click()`,
    );
    await evaluate(`new Promise(resolve => setTimeout(resolve, 400))`);
    await evaluate(
      `Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === '设置').click()`,
    );
    await ready();
    assert.equal(
      await evaluate(
        `Array.from(document.querySelectorAll('.t-dialog')).filter(dialog => getComputedStyle(dialog).visibility === 'visible' && dialog.getBoundingClientRect().width > 0).length`,
      ),
      1,
      'There must be one settings dialog',
    );
    await evaluate(
      `Array.from(document.querySelectorAll('.t-dialog')).find(dialog => dialog.textContent.includes('界面语言')).querySelector('.t-dialog__close').click()`,
    );
    await evaluate(`new Promise(resolve => setTimeout(resolve, 400))`);
    await evaluate(`(async () => { await testStore.chooseTemplate(); await testStore.go(1); })()`);
    await ready();
    await evaluate(`(() => {
    const target = document.getElementById('field-name');
    const input = target instanceof HTMLInputElement ? target : target.querySelector('input');
    input.value = 'Alice'; input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
    await ready();
    assert.equal(await evaluate(`testStore.current.values.name`), 'Alice');
    assert.ok(
      await evaluate(
        `document.querySelector('.field-row .t-switch').getBoundingClientRect().width < 80`,
      ),
    );
    assert.ok(
      await evaluate(
        `Array.from(document.querySelectorAll('.t-dialog')).filter(dialog => getComputedStyle(dialog).visibility === 'visible' && dialog.getBoundingClientRect().width > 0).length === 0`,
      ),
      'The About dialog must be closed',
    );
    await screenshot('manual-1600');
    const proportions = await evaluate<{ left: number; right: number }>(
      `({ left: document.querySelector('.record-column').getBoundingClientRect().width, right: document.querySelector('.form-column').getBoundingClientRect().width })`,
    );
    assert.ok(
      Math.abs(proportions.right / proportions.left - 3) < 0.01,
      'Manual layout must use a 1:3 ratio',
    );
    await evaluate(`testPrefs.setLanguage('en-US')`);
    await ready();
    assert.ok(await evaluate(`document.body.textContent.includes('Edit record 1')`));
    assert.ok(await evaluate(`document.body.textContent.includes('Prepare data')`));
    assert.equal(await evaluate(`testStore.current.values.name`), 'Alice');
    assert.equal(await evaluate(`document.documentElement.lang`), 'en-US');
    await screenshot('manual-en-1600');
    await evaluate(`testPrefs.setLanguage('zh-CN')`);
    await resize(1100, 780);
    await screenshot('manual-1100');
    await resize(760, 580);
    await screenshot('manual-760');
    await evaluate(`testPrefs.setLanguage('en-US')`);
    await screenshot('manual-en-760');
    await evaluate(`testPrefs.setLanguage('system')`);
    await evaluate(`(async () => {
    testStore.current.values.items.push({ label: 'Desk' }); testStore.invalidate();
    await testStore.go(2);
    testStore.updateOutput({ mode: 'zip', destination: ${JSON.stringify(path.join(root, 'manual.zip'))} });
    await testStore.planOutput();
  })()`);
    assert.equal(
      await evaluate(`testStore.preview?.documentCount`),
      1,
      await evaluate(`JSON.stringify(testStore.issues)`),
    );
    await evaluate(`document.querySelector('.output-preview').scrollIntoView({ block: 'center' })`);
    await screenshot('output-760');
    await evaluate(`testStore.generate()`);
    assert.equal(await evaluate(`testStore.generated.documentCount`), 1);
    assert.ok((await readFile(path.join(root, 'manual.zip'))).length > 0);
    await screenshot('result-760');
    await evaluate(
      `(async () => { await testStore.go(1); await testStore.switchMode('file'); })()`,
    );
    selectedFile = path.join(root, 'records.xlsx');
    await writeFile(
      selectedFile,
      await createXlsx({
        Records: [
          ['__templify_id', 'name', 'amount', 'enabled', 'day', 'created', 'department'],
          ['a', 'Alice', 10, 'true', '2026-10-01', '2026-10-01T12:30:00', 'Engineering'],
          ['b', 'Bob', 20, 'false', null, null, 'Office'],
        ],
        items: [
          ['__templify_parent_id', 'label'],
          ...Array.from({ length: 12 }, (_, index) => ['a', `Item ${index + 1}`]),
        ],
        payments: [
          ['__templify_parent_id', 'value'],
          ['a', 100],
        ],
      }),
    );
    await evaluate(`testStore.importFile()`);
    assert.equal(await evaluate(`testStore.count`), 2);
    selectedOutput = path.join(root, 'input-template.xlsx');
    await evaluate(`testStore.exportExcel()`);
    assert.equal(await evaluate(`testStore.issues.length`), 0);
    await evaluate(`testStore.openExcelTemplate()`);
    assert.equal(openedFile, selectedOutput);
    await evaluate(`window.scrollTo(0, 0)`);
    await screenshot('excel-saved-760');
    openError = 'Application not found';
    await evaluate(`testStore.openExcelTemplate()`);
    await ready();
    assert.equal(await evaluate(`testStore.issues.length`), 0);
    assert.ok(await evaluate(`document.body.textContent.includes('无法打开文件')`));
    await screenshot('open-error-760');
    await evaluate(`document.querySelector('.t-notification .t-message__close').click()`);
    await evaluate(`new Promise(resolve => setTimeout(resolve, 3200))`);
    openError = '';
    await ready();
    await evaluate(
      `Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('共 12 项')).click()`,
    );
    await evaluate(`document.querySelector('.expanded-cell').scrollIntoView({ block: 'start' })`);
    await screenshot('collections-760');
    const columns = await evaluate<{ header: number[]; cells: number[] }>(
      `({ header: Array.from(document.querySelectorAll('.child-table th')).map(cell => cell.getBoundingClientRect().x), cells: Array.from(document.querySelectorAll('.child-table tbody tr:first-child td')).map(cell => cell.getBoundingClientRect().x) })`,
    );
    assert.deepEqual(columns.cells, columns.header, 'Collection headers and values must align');
    assert.equal(await evaluate(`document.querySelectorAll('.child-table tbody tr').length`), 10);
    await evaluate(
      `Array.from(document.querySelectorAll('.t-tabs__nav-item')).find(tab => tab.textContent.includes('payments')).click()`,
    );
    await ready();
    assert.ok(await evaluate(`document.body.textContent.includes('100')`));
    await resize(1100, 780);
    await screenshot('collections-1100');
    await resize(1600, 900);
    await evaluate(`window.scrollTo(0, 0)`);
    await screenshot('collections-1600');
    await evaluate(
      `(async () => { await testStore.go(2); testStore.updateOutput({ mode: 'zip', destination: ${JSON.stringify(path.join(root, 'batch.zip'))}, pathTemplate: '{name}.docx' }); await testStore.planOutput(); })()`,
    );
    await screenshot('output-1600');
    await evaluate(`testStore.generate()`);
    assert.equal(await evaluate(`testStore.generated.documentCount`), 2);
    assert.ok(await evaluate(`document.body.textContent.includes('已生成 ZIP，包含')`));
    assert.ok(!(await evaluate(`document.body.textContent.includes('覆盖 0 个输出文件')`)));
    await screenshot('result-1600');
    await evaluate(`testPrefs.setLanguage('en-US')`);
    await ready();
    assert.ok(
      await evaluate(`document.body.textContent.includes('ZIP generated with 2 DOCX documents.')`),
    );
    assert.ok(
      await evaluate(
        `!/[\u4e00-\u9fff]/.test(document.querySelector('.desktop-shell').textContent)`,
      ),
    );
    await screenshot('result-en-1600');
    assert.deepEqual(errors, []);
    await writeFile(path.resolve('.desktop/qa/result.json'), JSON.stringify({ passed: true }));
    console.log(
      `UI smoke passed: bilingual UI, 1:3 layout, help, export/open feedback, manual form, collection tabs/paging, ZIP generation; 1600×900, 1100×780 and 760×580.`,
    );
  } catch (cause) {
    console.error(cause);
    console.error('Renderer errors:', errors);
    console.error(
      'Dialog state:',
      await evaluate(
        `Array.from(document.querySelectorAll('.t-dialog')).map(dialog => ({ title: dialog.textContent.slice(0, 50), visibility: getComputedStyle(dialog).visibility, parent: dialog.closest('.t-dialog__ctx')?.outerHTML.slice(0, 300) }))`,
      ),
    );
    await writeFile(
      path.resolve('.desktop/qa/result.json'),
      JSON.stringify({ passed: false, reason: String(cause), errors }),
    );
    process.exitCode = 1;
  } finally {
    window.destroy();
    await rm(root, { recursive: true, force: true });
    app.exit(Number(process.exitCode ?? 0));
  }
}
