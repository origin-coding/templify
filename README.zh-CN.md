# Templify

[English](README.md) | [简体中文](README.zh-CN.md)

Templify 使用你提供的记录填充 Word 模板。桌面应用适合交互式填写表单，CLI 适合通过脚本生成文档。
每条记录生成一份独立文档，集合用于重复这份文档内部的内容。

## 功能

- 检查 DOCX 模板，发现字段及其轻量类型提示。
- 在桌面应用中手动填写多条记录，增删集合项。
- 导入 CSV 或 XLSX，按字段名匹配，不依赖列顺序。
- 每条记录生成一份 DOCX 或 PDF，输出到单文件、目录或 ZIP。
- 在目录或 ZIP 输出中附加按记录顺序合并的 PDF。
- 在桌面应用中预览单条或全部记录的 PDF，无需先选择输出位置。
- 设置日期、日期时间、数字和布尔值的输出格式。
- 预览输出路径，清理记录值中的非法文件名字符；只有明确允许覆盖后才替换已有文件。
- 使用英文或简体中文桌面界面。

Templify 不提供 DOCX/PDF 内容编辑、电子表格公式计算、账户、工作流或文档管理系统。

## 试用演示材料

[演示说明](docs/demos/README.zh-CN.md)提供两份英文模板：

| 示例                                                    | 演示内容                             |
| ------------------------------------------------------- | ------------------------------------ |
| [活动报名确认单](docs/demos/workshop-registration.docx) | 文本、日期、数字、布尔值和重复字段。 |
| [设备领用单](docs/demos/equipment-checkout.docx)        | 每份文档内部重复设备表格行。         |
| [设备领用示例表格](docs/demos/equipment-checkout.xlsx)  | 两条记录，分别包含三项和两项设备。   |

在桌面应用中：

1. 在**选择模板**中打开 DOCX 文件。
2. 在**准备数据**中填写记录，或导入 CSV/XLSX。设备示例导入配套工作簿，主工作表选择 `checkouts`。
3. 按需调整字段格式，或预览当前记录、全部记录的 PDF。
4. 在**设置输出**中选择 DOCX 或 PDF，以及单文件、目录或 ZIP。单文件输出仅接受一条记录。
5. 选择目标位置，预览路径并生成。目标文件已存在时，查看覆盖确认后再继续。

设备示例选择目录或 ZIP 输出，路径模板使用 `{checkoutId}.docx`，将生成 `EC-001.docx` 和 `EC-002.docx`。

## 模板标签

| 标签                                                    | 含义                         |
| ------------------------------------------------------- | ---------------------------- |
| `{name}` 或 `{name:string}`                             | 文本；前导零保持为文本。     |
| `{amount:number}`                                       | 数字。                       |
| `{enabled:boolean}`                                     | 布尔值。                     |
| `{birthday:date}`                                       | 日历日期。                   |
| `{startsAt:datetime}`                                   | 日期和时间。                 |
| `{department:option["Engineering","Finance","Office"]}` | 建议选项；也接受其他文本值。 |

集合通过循环标签包围明细字段，例如：

```text
{#items}
{itemName} - {quantity:number}
{/items}
```

集合只支持一层标量明细字段，不支持嵌套或反向循环。集合项不会额外生成独立文档。

## 数据与输出规则

- CSV/XLSX 表头必须与字段名完全一致。缺失或重复列会报错，额外列会被忽略并产生诊断，空行会跳过。
- CSV 仅支持标量字段。XLSX 通过独立工作表及 `__templify_id`、`__templify_parent_id` 支持集合。
- Excel 输入只接受 `.xlsx`。公式单元格必须已有 Excel 保存的可用结果，Templify 不计算公式。
- 目录与 ZIP 路径模板支持字面文本和占位符，例如 `{department}/{name}.docx`，以及从 1 开始的记录序号 `{$index}`。
  记录值会作为单个路径段清理，只有模板中的分隔符能创建目录层级。
- 不提供多条记录合并为一个 DOCX 的模式。可选的合并 PDF 遵循已接受的记录顺序。

[CLI 使用说明](apps/cli/README.zh-CN.md)包含类型转换、集合工作簿协议、命令参数和格式配置 JSON。

## 格式与限制

桌面设置会保存界面语言及各类型的默认格式。准备数据阶段可为当前模板的字段及集合明细字段设置独立格式。
更换模板或开始新任务后，字段规则会清除。关闭应用后，不恢复记录或文档任务。

**PDF 预览和导出可能出现字体、格式或分页错误，即使字体已经嵌入也无法保证一致。请以最终生成的 DOCX 为准。**
转换诊断不能保证视觉保真度。请在 Word 中检查生成的 DOCX，分享或打印 PDF 前也应检查内容与排版。

DOCX 填充不需要网络连接。PDF 转换在缺少合适的嵌入字体、桌面本地字体或缓存字体时，可能下载并缓存替代字体。
应用不内置字体，也不提供直接打印，请通过外部应用打开生成文件并打印。

## 从源码运行

需要 **Node.js 24.11.0 或更新版本**和 **pnpm 11**，pnpm 使用根目录 `packageManager` 字段指定的版本。
在仓库根目录执行：

```shell
pnpm install
pnpm --filter @templify/desktop dev
```

桌面开发命令会构建共享包，启动监听、Nuxt 和 Electron。
Electron 运行时需要单独下载；下载源不可用时，可在启动前配置环境变量 `ELECTRON_MIRROR`。

构建 Windows x64 NSIS 安装包：

```shell
pnpm --filter @templify/desktop package:win
```

此命令会先构建 Desktop 及共享包，再生成安装包，产物位于 `apps/desktop/release/`。
手动触发 Actions 和发布的步骤见[发布指南](docs/releasing.md)。

开发时，如需创建未打包为安装程序的 Windows 应用目录：

```shell
pnpm --filter @templify/desktop build
pnpm --filter @templify/desktop exec electron-builder --dir --win --publish never
```

产物位于 `apps/desktop/release/`。此命令生成应用目录，而非安装包。

从源码试用 CLI：

```shell
pnpm --filter @templify/core --filter @templify/node-output --filter @templify/tabular-input --filter @templify/cli build
node apps/cli/dist/index.js inspect docs/demos/workshop-registration.docx
```

检查命令和开发约定见[贡献指南](CONTRIBUTING.md)。

## 仓库与更多说明

| 目录                     | 职责                                            |
| ------------------------ | ----------------------------------------------- |
| `apps/desktop`           | 基于 Electron、Nuxt/Vue 和 TDesign 的桌面应用。 |
| `apps/cli`               | 提供 `inspect`、`generate` 的 CLI 适配器。      |
| `packages/core`          | 内存中的模板准备、转换、规划、渲染和打包。      |
| `packages/tabular-input` | CSV/XLSX 解析和输入表格导出。                   |
| `packages/node-output`   | 文件系统写入及 Node PDF 字体处理。              |
| `tests`                  | 跨包集成测试。                                  |
| `docs/demos`             | 模板、输入数据和双语说明。                      |
| `docs/decisions`         | 长期架构和产品决策。                            |

- [CLI 使用说明](apps/cli/README.zh-CN.md)
- [发布流程](docs/releasing.md)
- [共享格式配置](docs/decisions/render-formatting.md)
- [核心处理流水线](docs/decisions/staged-core-pipeline.md)
- [PDF 预览与字体](docs/decisions/desktop-pdf-and-fonts.md)
- [问题与反馈](https://github.com/origin-coding/templify/issues)

## 许可证

[Apache License 2.0](LICENSE)。
