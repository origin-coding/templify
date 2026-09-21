import PizZip from 'pizzip';

export type Paragraph = readonly string[];

export function createDocx(paragraphs: readonly Paragraph[]): Buffer {
  return createDocxFromBodyXml(paragraphs.map(createParagraphXml).join(''));
}

export function createDocxWithTableRow(cells: readonly Paragraph[]): Buffer {
  const row = cells
    .map(
      (runs) =>
        '<w:tc><w:tcPr/><w:p>' +
        runs.map((text) => `<w:r><w:t>${escapeXml(text)}</w:t></w:r>`).join('') +
        '</w:p></w:tc>',
    )
    .join('');

  return createDocxFromBodyXml(`<w:tbl><w:tblPr/><w:tblGrid/><w:tr>${row}</w:tr></w:tbl>`);
}

function createDocxFromBodyXml(bodyXml: string): Buffer {
  const zip = new PizZip();

  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
  );
  zip
    .folder('_rels')
    ?.file(
      '.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>',
    );
  zip
    .folder('word')
    ?.file(
      'document.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        `<w:body>${bodyXml}<w:sectPr/></w:body>` +
        '</w:document>',
    );

  return zip.generate({ type: 'nodebuffer' });
}

function createParagraphXml(runs: Paragraph): string {
  return `<w:p>${runs.map((text) => `<w:r><w:t>${escapeXml(text)}</w:t></w:r>`).join('')}</w:p>`;
}

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
