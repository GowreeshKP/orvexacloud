const fs = require('fs');
const path = require('path');
const docx = require('docx');

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  WidthType,
  AlignmentType,
  ShadingType
} = docx;

function parseMarkdownToDocxElements(mdContent) {
  const lines = mdContent.split(/\r?\n/);
  const elements = [];
  let inCodeBlock = false;
  let codeBlockLines = [];
  let inTable = false;
  let tableRows = [];

  const flushCodeBlock = () => {
    if (codeBlockLines.length > 0) {
      const codeText = codeBlockLines.join('\n');
      const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: { type: ShadingType.CLEAR, fill: 'F4F6F8' },
                margins: { top: 120, bottom: 120, left: 160, right: 160 },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
                  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
                  left: { style: BorderStyle.SINGLE, size: 12, color: '0969DA' },
                  right: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
                },
                children: codeBlockLines.map(
                  (cline) =>
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: cline || ' ',
                          font: 'Consolas',
                          size: 18,
                          color: '24292F',
                        }),
                      ],
                      spacing: { after: 40, before: 40 },
                    })
                ),
              }),
            ],
          }),
        ],
      });
      elements.push(table);
      elements.push(new Paragraph({ spacing: { after: 120 } }));
      codeBlockLines = [];
    }
    inCodeBlock = false;
  };

  const flushTable = () => {
    if (tableRows.length > 0) {
      const parsedRows = tableRows
        .filter((r) => !r.trim().match(/^\|?[\s-:]+\|?$/)) // filter separator rows
        .map((rowStr, rowIndex) => {
          const cells = rowStr
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((c) => c.trim());

          const isHeader = rowIndex === 0;

          return new TableRow({
            tableHeader: isHeader,
            children: cells.map(
              (cellText) =>
                new TableCell({
                  shading: {
                    type: ShadingType.CLEAR,
                    fill: isHeader ? '0969DA' : rowIndex % 2 === 1 ? 'FFFFFF' : 'F6F8FA',
                  },
                  margins: { top: 100, bottom: 100, left: 120, right: 120 },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
                    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
                    left: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
                    right: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
                  },
                  children: [
                    new Paragraph({
                      alignment: isHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
                      children: parseFormattedText(cellText, isHeader),
                      spacing: { before: 40, after: 40 },
                    }),
                  ],
                })
            ),
          });
        });

      if (parsedRows.length > 0) {
        const docxTable = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: parsedRows,
        });
        elements.push(docxTable);
        elements.push(new Paragraph({ spacing: { after: 120 } }));
      }
      tableRows = [];
    }
    inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        if (inTable) flushTable();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Check tables
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      inTable = true;
      tableRows.push(line);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Empty lines
    if (!line.trim()) {
      elements.push(new Paragraph({ spacing: { after: 80 } }));
      continue;
    }

    // Horizontal Rule
    if (line.trim().match(/^---+$|^\*\*\*+$/)) {
      elements.push(
        new Paragraph({
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 8, color: '0969DA' },
          },
          spacing: { before: 120, after: 120 },
        })
      );
      continue;
    }

    // Headings
    if (line.startsWith('# ')) {
      elements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [
            new TextRun({
              text: line.replace('# ', '').trim(),
              bold: true,
              size: 36,
              color: '0969DA',
              font: 'Calibri',
            }),
          ],
          spacing: { before: 240, after: 120 },
        })
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({
              text: line.replace('## ', '').trim(),
              bold: true,
              size: 28,
              color: '1F2328',
              font: 'Calibri',
            }),
          ],
          spacing: { before: 200, after: 100 },
        })
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [
            new TextRun({
              text: line.replace('### ', '').trim(),
              bold: true,
              size: 24,
              color: '24292F',
              font: 'Calibri',
            }),
          ],
          spacing: { before: 160, after: 80 },
        })
      );
    } else if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const bulletText = line.trim().substring(2);
      elements.push(
        new Paragraph({
          bullet: { level: 0 },
          children: parseFormattedText(bulletText, false),
          spacing: { before: 40, after: 40 },
        })
      );
    } else if (line.trim().match(/^\d+\.\s+/)) {
      const match = line.trim().match(/^(\d+)\.\s+(.*)/);
      const numText = match ? match[2] : line.trim();
      elements.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${match ? match[1] : '1'}. `, bold: true, color: '0969DA' }),
            ...parseFormattedText(numText, false),
          ],
          spacing: { before: 40, after: 40 },
        })
      );
    } else {
      // Normal paragraph
      elements.push(
        new Paragraph({
          children: parseFormattedText(line, false),
          spacing: { before: 60, after: 60 },
          lineSpacing: 276,
        })
      );
    }
  }

  if (inCodeBlock) flushCodeBlock();
  if (inTable) flushTable();

  return elements;
}

function parseFormattedText(rawText, isHeader) {
  const runs = [];
  // Simple markdown regex for bold, inline code, links
  // Split by bold (**text**) or code (`text`)
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(rawText)) !== null) {
    if (match.index > lastIndex) {
      const plain = rawText.substring(lastIndex, match.index);
      runs.push(
        new TextRun({
          text: plain,
          font: 'Calibri',
          size: 22,
          color: isHeader ? 'FFFFFF' : '24292F',
          bold: isHeader,
        })
      );
    }

    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      runs.push(
        new TextRun({
          text: token.slice(2, -2),
          font: 'Calibri',
          size: 22,
          bold: true,
          color: isHeader ? 'FFFFFF' : '1F2328',
        })
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      runs.push(
        new TextRun({
          text: token.slice(1, -1),
          font: 'Consolas',
          size: 20,
          color: isHeader ? 'FFFFFF' : '0969DA',
          shading: isHeader
            ? undefined
            : { type: ShadingType.CLEAR, fill: 'EFF2F5' },
        })
      );
    } else if (token.startsWith('[') && token.includes('](')) {
      const linkMatch = token.match(/\[(.*?)\]\((.*?)\)/);
      if (linkMatch) {
        runs.push(
          new TextRun({
            text: linkMatch[1],
            font: 'Calibri',
            size: 22,
            color: isHeader ? 'FFFFFF' : '0969DA',
            underline: { type: 'single' },
          })
        );
      }
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < rawText.length) {
    runs.push(
      new TextRun({
        text: rawText.substring(lastIndex),
        font: 'Calibri',
        size: 22,
        color: isHeader ? 'FFFFFF' : '24292F',
        bold: isHeader,
      })
    );
  }

  return runs.length > 0
    ? runs
    : [
        new TextRun({
          text: rawText,
          font: 'Calibri',
          size: 22,
          color: isHeader ? 'FFFFFF' : '24292F',
          bold: isHeader,
        }),
      ];
}

async function convertFile(mdPath, docxPath, title) {
  const mdContent = fs.readFileSync(mdPath, 'utf8');
  const docElements = parseMarkdownToDocxElements(mdContent);

  const doc = new Document({
    title: title,
    creator: 'Orvexa Tech Platform Architecture',
    description: title,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        children: docElements,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(docxPath, buffer);
  console.log(`Generated: ${docxPath}`);
}

async function main() {
  const docsDir = path.join(__dirname, '..', 'docs');
  const filesToConvert = [
    {
      md: 'Orvexa_Tenant_Merchant_Data_Protection_Policy_v1.0.md',
      docx: 'Orvexa_Tenant_Merchant_Data_Protection_Policy_v1.0.docx',
      title: 'Tenant & Merchant Data Protection Policy',
    },
    {
      md: 'Orvexa_Complete_Master_Architecture_Roadmap_v1.1_TechStack_Execution.md',
      docx: 'Orvexa_Complete_Master_Architecture_Roadmap_v1.1_TechStack_Execution.docx',
      title: 'Complete Master Architecture Roadmap & TechStack Execution',
    },
    {
      md: 'Orvexa_Final_Production_Architecture_Scalability_Security_Audit.md',
      docx: 'Orvexa_Final_Production_Architecture_Scalability_Security_Audit.docx',
      title: 'Final Production Architecture, Scalability & Security Audit',
    },
    {
      md: 'Orvexa_Master_Pre_Development_Blueprint_v1.1_TechStack_Requirements.md',
      docx: 'Orvexa_Master_Pre_Development_Blueprint_v1.1_TechStack_Requirements.docx',
      title: 'Master Pre-Development Blueprint & Technical Requirements',
    },
    {
      md: 'Orvexa_Consumer_Privacy_GDPR_Data_Rights_Policy_v1.0.md',
      docx: 'Orvexa_Consumer_Privacy_GDPR_Data_Rights_Policy_v1.0.docx',
      title: 'Consumer Privacy & GDPR Data Rights Policy',
    },
    {
      md: 'PROJECT_COMPLETE_DOCUMENTATION.md',
      docx: 'Orvexa_Complete_Project_Master_Documentation_v2.0.docx',
      title: 'Orvexa Tech Complete Project Master Documentation',
    },
  ];

  for (const item of filesToConvert) {
    const mdPath = path.join(docsDir, item.md);
    const docxPath = path.join(docsDir, item.docx);
    if (fs.existsSync(mdPath)) {
      await convertFile(mdPath, docxPath, item.title);
    }
  }

  console.log('All documents successfully generated as MS Word (.docx) files!');
}

main().catch(console.error);
