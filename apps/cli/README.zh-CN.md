# Templify CLI

[English](README.md) | [简体中文](README.zh-CN.md)

从命令行参数、CSV 或 XLSX 填充 DOCX 模板。`templify` 提供 `inspect` 和 `generate`，与桌面应用使用同一套核心服务。

## 从源码运行

需要 **Node.js 24.11.0 或更新版本**和 **pnpm 11**，pnpm 使用根目录 `packageManager` 字段指定的版本。
在仓库根目录执行：

```shell
pnpm install
pnpm --filter @templify/core --filter @templify/node-output --filter @templify/tabular-input --filter @templify/cli build
node apps/cli/dist/index.js --help
```

下方示例使用安装后的命令名 `templify`。从源码运行时，请替换为 `node apps/cli/dist/index.js`，并在仓库根目录执行。
文件路径相对于当前工作目录。

## 快速上手

将[演示材料](https://github.com/origin-coding/templify/tree/main/docs/demos)下载到工作目录，生成两份领用单：

```shell
templify inspect equipment-checkout.docx
templify generate equipment-checkout.docx --input equipment-checkout.xlsx --sheet checkouts --output-dir output --path-template "{checkoutId}.docx"
```

预期得到包含三行设备的 `output/EC-001.docx` 和包含两行设备的 `output/EC-002.docx`。
手动填写单条记录：

```shell
templify generate workshop-registration.docx --set "participantName=Alex Morgan" --set "registrationId=001234" --set "workshopTitle=Introduction to Urban Gardening" --set "workshopDate=2026-11-06" --set "seatCount=2" --set "materialsRequested=true" --output-file registration.docx
```

使用 `templify --help`、`templify inspect --help` 或 `templify generate --help` 查看命令帮助。
下方通用 CSV 和 PDF 示例需要模板字段与输入匹配；`--set name=Alice` 假定模板包含 `{name}`。

## 检查模板

```shell
templify inspect template.docx
templify inspect template.docx --format json
templify inspect template.docx --format json --output fields.json
templify inspect template.docx --format csv-template --output records.csv
templify inspect template.docx --format excel-template --output records.xlsx
```

| 参数          | 行为                                                          |
| ------------- | ------------------------------------------------------------- |
| `--format`    | `table`（默认）、`json`、`csv-template` 或 `excel-template`。 |
| `--output`    | 将结果写入文件而非 stdout；导出 CSV/XLSX 输入模板时必填。     |
| `--overwrite` | 允许替换目标文件，必须同时指定 `--output`。                   |

指定 `--output` 时，JSON/CSV/XLSX 分别要求 `.json`/`.csv`/`.xlsx` 扩展名，表格文本没有扩展名限制。
CSV 模板只有一行表头，带 UTF-8 BOM，且不支持集合；XLSX 模板会创建主表及集合表。

## 生成文档

以下目标必须且只能选择一个：

| 参数                   | 输出                                 |
| ---------------------- | ------------------------------------ |
| `--output-file <path>` | 一份指定名称的文档，只接受一条记录。 |
| `--output-dir <path>`  | 每条记录生成一份文件，放入目录。     |
| `--output-zip <path>`  | 每条记录生成一个文档条目，放入 ZIP。 |

其他生成参数：

| 参数                           | 行为                                                             |
| ------------------------------ | ---------------------------------------------------------------- |
| `--set field=value`            | 重复指定单条手动记录的标量字段，不能与 `--input` 同用。          |
| `--input <path>`               | 读取 `.csv` 或 `.xlsx`。                                         |
| `--sheet <name>`               | 选择 XLSX 中可见的主工作表。                                     |
| `--input-encoding <encoding>`  | CSV 的 `utf8`（默认）或 `gbk` 编码。                             |
| `--path-template <template>`   | 使用主记录字段及 `{$index}` 命名目录/ZIP 中的文件。              |
| `--document-format <format>`   | 每条记录输出为 `docx`（默认）或 `pdf`。                          |
| `--merged-pdf <relative-path>` | 为目录/ZIP 附加按记录顺序合并的 PDF。                            |
| `--render-options <file.json>` | 设置标量及集合明细字段的输出格式。                               |
| `--dry-run`                    | 检查输入、格式、路径及文件冲突，显示计划，不渲染或写入最终产物。 |
| `--overwrite`                  | 明确允许替换已有输出文件。                                       |

`--sheet` 仅用于 XLSX，`--input-encoding` 仅用于 CSV。
手动 `--set` 不接受集合数组或 JSON 记录；集合请使用 XLSX 或桌面应用。

### 目录与 ZIP 示例

```shell
templify generate template.docx --input records.csv --output-dir output
templify generate template.docx --input records.csv --output-dir output --path-template "{department}/{name}.docx"
templify generate template.docx --input legacy.csv --input-encoding gbk --output-dir output
templify generate equipment-checkout.docx --input equipment-checkout.xlsx --sheet checkouts --output-zip checkouts.zip --path-template "{checkoutId}.docx"
```

默认命名为 `document-{$index}.docx` 或 `document-{$index}.pdf`，记录序号从 1 开始。
只有路径模板中的字面分隔符能创建目录层级，记录值会作为单个路径段清理，包括 Windows 非法字符和保留设备名。
最终路径会检查目录穿越。计划中的重复文件名即使指定 `--overwrite` 也会报错，请使用唯一字段或 `{$index}`。

路径模板省略扩展名时，会补上所选格式的扩展名；指定不同扩展名会报错。
`--output-file` 要求对应格式的 `.docx`/`.pdf`，`--output-zip` 要求 `.zip`，`--merged-pdf` 要求相对 `.pdf` 路径。
输出不允许覆盖模板、输入或格式配置文件。

### PDF 输出

```shell
templify generate template.docx --set "name=Alice" --output-file alice.pdf --document-format pdf
templify generate equipment-checkout.docx --input equipment-checkout.xlsx --output-dir output --path-template "{checkoutId}.pdf" --document-format pdf --merged-pdf all.pdf
templify generate equipment-checkout.docx --input equipment-checkout.xlsx --output-zip checkouts.zip --path-template "{checkoutId}.docx" --merged-pdf all.pdf
```

DOCX 输出附加 `--merged-pdf` 时，单条记录的 PDF 仅保留在内存，最终发布 DOCX 和合并 PDF。
选择 PDF 输出时，会发布每条记录的 PDF 及可选的合并 PDF。
没有合并 DOCX 模式，也不同时导出每条记录的 DOCX 与 PDF。

**PDF 可能出现字体、格式或分页错误，即使字体已嵌入也无法保证一致。请以最终生成的 DOCX 为准。**
转换警告写入 stderr，但没有警告也不代表保真。分享或打印前请检查 PDF。
转换可能下载尚未缓存的替代字体；CLI 不枚举系统字体。

## 字段与输入值

支持 `string`、`number`、`boolean`、`date`、`datetime`、`option[...]`。
没有类型提示的标签默认为字符串，选项列表仅为建议。

| 类型          | 输入行为                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------- |
| `string`      | 保留 `001234` 等文本；有限数字和布尔值可转换成文本。                                         |
| `number`      | 有限数字或数字文本，输入不含货币符号或千位分隔符。                                           |
| `boolean`     | 原生布尔值，或不区分大小写的 `true`/`false` 文本。                                           |
| `date`        | 原生日期，或 `YYYY-MM-DD` 文本。                                                             |
| `datetime`    | 原生日期，或 `2026-11-06T09:30:00+08:00` 等 ISO 风格文本；省略偏移时使用运行环境的本地时区。 |
| `option[...]` | 文本，包括建议列表之外的值。                                                                 |

CSV/XLSX 表头必须与字段名完全一致，列顺序没有语义。缺失或重复列会报错，额外列忽略并产生诊断，空行跳过。
CSV 默认使用 UTF-8，接受有或无 BOM 的文件，仅支持标量模板。
表格编辑器可能将 `001234` 转成数字；需要保留时，请导出 XLSX 输入模板并保持编号列为文本。

### XLSX 集合

默认读取第一个可见工作表作为主表，可用 `--sheet` 改选。主表的每个非空数据行生成一份文档。
`{#items}...{/items}` 循环要求名称完全一致的可见 `items` 工作表。
只支持一层集合，嵌套和反向循环会报错。

| 工作表   | 必须包含的列                                 |
| -------- | -------------------------------------------- |
| 主表     | `__templify_id`，以及主记录的标量字段名。    |
| 各集合表 | `__templify_parent_id`，以及集合明细字段名。 |

主记录 ID 必须是唯一的直接文本值，例如 `r1`/`r2`；明细行填写对应 ID。行排序后关联仍有效。
主 ID 为空或重复、关联 ID 找不到主记录、缺少集合表或字段列都会报错。
集合表只有表头、没有数据行时表示空集合。未使用的工作表和列会被忽略并产生诊断。
关联列名在对应作用域内保留，集合名称必须是有效的 Excel 工作表名称。

只接受 `.xlsx`，请先转换 `.xls`、`.xlsm`、`.xlsb`。
公式单元格使用已保存的计算结果，缺少结果或结果为错误值时，会报告所在单元格。
请先在 Excel 中重新计算并保存。关联 ID 必须是直接文本，不能使用公式。

## 输出格式

将以下内容保存为 `render-options.json`：

```json
{
  "locale": "en",
  "timeZone": "UTC",
  "defaults": {
    "boolean": { "trueText": "Yes", "falseText": "No" },
    "date": { "pattern": "YYYY-MM-DD" },
    "number": { "useGrouping": false, "maximumFractionDigits": 2 }
  },
  "formats": [
    { "path": ["items", "quantity"], "format": { "type": "number", "maximumFractionDigits": 0 } }
  ]
}
```

```shell
templify generate equipment-checkout.docx --input equipment-checkout.xlsx --output-dir formatted-output --path-template "{checkoutId}.docx" --render-options render-options.json
```

`formats` 中的字段规则整体替换该类型的默认规则，否则使用 `defaults`，最后使用内置格式。
主字段路径只有一个元素，集合明细路径有两个。`null` 输出为空文本。
字符串和选项字段没有格式规则。格式设置只改变文档文本，不改变输入数据或文件名。

格式语言支持 `en`、`zh-CN`。日期表示日历日期；日期时间可指定 IANA 时区，省略时使用运行环境的时区。
无自定义格式时，布尔值为 `true`/`false`，日期为 `YYYY-MM-DD`，日期时间为 `YYYY-MM-DD HH:mm:ss`，数字为标准字符串形式。
更多内容见[格式配置说明](https://github.com/origin-coding/templify/blob/main/docs/decisions/render-formatting.md)。

## 诊断与脚本使用

检查结果默认写入 stdout，除非指定 `--output`。
生成成功后，每行输出一个已发布文件的绝对路径；预检查每行输出以制表符分隔的计划动作和目标路径。
诊断写入 stderr。

| 退出码 | 含义                                                    |
| ------ | ------------------------------------------------------- |
| `0`    | 成功。                                                  |
| `1`    | 输入、模板、格式校验、渲染、写入或其他运行时失败。      |
| `2`    | 用法错误，包括无效参数或不可读取、无效的格式配置 JSON。 |

预检查不渲染文档或转换 PDF，因此不能发现所有渲染、字体和排版问题。默认禁止覆盖。

## 开发

完成上方源码构建后，在仓库根目录操作。用单独的终端启动 CLI 构建监听：

```shell
pnpm --filter @templify/cli dev
```

监听完成构建后，再执行 CLI 命令。检查打包后的命令：

```shell
pnpm --filter @templify/cli smoke
```

`smoke` 会打包 CLI，在隔离目录安装并检查安装后的命令。
构建会打入共享工作区包，使用者不需要单独安装这些私有包。

仓库检查和开发约定见[贡献指南](https://github.com/origin-coding/templify/blob/main/CONTRIBUTING.md)。

手动发布到 npm 及预发布标签的使用方式见[发布指南](https://github.com/origin-coding/templify/blob/main/docs/releasing.md)。

## 许可证

[Apache License 2.0](https://github.com/origin-coding/templify/blob/main/LICENSE)。
