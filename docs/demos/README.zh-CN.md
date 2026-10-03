# 演示模板

[English](README.md) | [简体中文](README.zh-CN.md)

这些示例以虚构的 Northfield Community Workshop（诺斯菲尔德社区工作坊）为背景，模板正文为英文。
在 Templify 中打开 DOCX 模板，准备输入记录，即可生成文档。

| 文件                                                     | 用途                                             |
| -------------------------------------------------------- | ------------------------------------------------ |
| [workshop-registration.docx](workshop-registration.docx) | 通过手动输入演示字符串、日期、数字和布尔值字段。 |
| [equipment-checkout.docx](equipment-checkout.docx)       | 带有设备清单的领用单，通过集合重复表格行。       |
| [equipment-checkout.xlsx](equipment-checkout.xlsx)       | 两条领用记录及其对应的设备明细。                 |

## 活动报名确认单

打开 `workshop-registration.docx`，为第一条手动记录填写以下值：

| 字段                 | 示例值                          |
| -------------------- | ------------------------------- |
| `participantName`    | Alex Morgan                     |
| `registrationId`     | 001234                          |
| `workshopTitle`      | Introduction to Urban Gardening |
| `workshopDate`       | 2026-11-06                      |
| `seatCount`          | 2                               |
| `materialsRequested` | true                            |

将 `registrationId` 保持为文本，以保留开头的零。参与者姓名在模板中出现两次，填写一次即可替换两处。
为便于阅读，可将布尔值的输出格式设置为 `Yes` / `No`，日期格式设置为 `YYYY-MM-DD`。

演示批量生成时，可以再添加一条记录，也可以从模板导出输入表格，按照相同字段名填写数据后导入。

## 设备领用单

打开 `equipment-checkout.docx`，选择 Excel 输入并导入 `equipment-checkout.xlsx`。
如果需要选择主工作表，请选择 `checkouts`。

示例工作簿仅包含两个数据工作表，第一行均为字段名：

- `checkouts`：两条主记录，`__templify_id` 列中的文本值 `r1` 和 `r2` 分别标识两条记录。
- `items`：五项设备，通过 `__templify_parent_id` 列关联到对应的主记录。
  工作表名称与模板中的 `{#items}...{/items}` 集合标签一致。

日期单元格使用 Excel 原生日期，数量为数字，`conditionChecked` 使用原生布尔值。
关联 ID 和设备编号为文本。生成前，可将布尔值的输出格式设置为 `Yes` / `No`，日期格式设置为 `YYYY-MM-DD`。

选择目录或 ZIP 输出，将路径模板设置为 `{checkoutId}.docx`，预期得到：

| 输出文件      | 领用人      | 设备明细行数 |
| ------------- | ----------- | ------------ |
| `EC-001.docx` | Alex Morgan | 3            |
| `EC-002.docx` | Jamie Lee   | 2            |

每条主记录生成一份文档。集合项用于重复该文档内的设备表格行，不会额外生成文档。
工作表中的行重新排序后，基于 ID 的关联仍然有效。
修改示例时，请保持工作表名称、列名和关联 ID 一致。CSV 输入不支持集合。
