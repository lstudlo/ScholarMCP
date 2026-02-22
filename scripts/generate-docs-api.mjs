import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const sourcePath = resolve(repoRoot, 'packages/scholar-mcp/src/mcp/create-scholar-mcp-server.ts');
const outputJsonPath = resolve(repoRoot, 'apps/docs/src/generated/mcp-tools.json');
const outputMdxPath = resolve(repoRoot, 'apps/docs/src/content/docs/reference/mcp-tools.mdx');

const sourceText = readFileSync(sourcePath, 'utf8');
const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

const getNodeText = (node) => sourceText.slice(node.pos, node.end).trim();

const getObjectProperty = (obj, key) =>
  obj.properties.find((prop) => {
    if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) {
      return false;
    }
    const name = prop.name;
    if (ts.isIdentifier(name)) {
      return name.text === key;
    }
    if (ts.isStringLiteral(name)) {
      return name.text === key;
    }
    return false;
  });

const getStringFromExpression = (expr) => {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return expr.text;
  }
  return null;
};

const parseAnnotations = (obj) => {
  const annotationsProp = getObjectProperty(obj, 'annotations');
  if (!annotationsProp || !ts.isPropertyAssignment(annotationsProp)) {
    return {};
  }

  if (!ts.isObjectLiteralExpression(annotationsProp.initializer)) {
    return {};
  }

  const out = {};
  for (const prop of annotationsProp.initializer.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      continue;
    }
    const key = ts.isIdentifier(prop.name)
      ? prop.name.text
      : ts.isStringLiteral(prop.name)
        ? prop.name.text
        : null;

    if (!key) {
      continue;
    }

    if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
      out[key] = true;
      continue;
    }

    if (prop.initializer.kind === ts.SyntaxKind.FalseKeyword) {
      out[key] = false;
      continue;
    }

    const stringValue = getStringFromExpression(prop.initializer);
    if (stringValue !== null) {
      out[key] = stringValue;
      continue;
    }

    out[key] = getNodeText(prop.initializer);
  }

  return out;
};

const extractStringProperty = (obj, key) => {
  const prop = getObjectProperty(obj, key);
  if (!prop || !ts.isPropertyAssignment(prop)) {
    return null;
  }
  return getStringFromExpression(prop.initializer);
};

const inferType = (exprText) => {
  const checks = [
    ['enum', /z\.enum\(/],
    ['array', /z\.array\(/],
    ['string', /z\.string\(/],
    ['number', /z\.number\(/],
    ['boolean', /z\.boolean\(/],
    ['object', /z\.object\(/],
    ['union', /z\.union\(/],
    ['tuple', /z\.tuple\(/],
    ['literal', /z\.literal\(/]
  ];

  for (const [type, pattern] of checks) {
    if (pattern.test(exprText)) {
      return type;
    }
  }

  return 'unknown';
};

const extractDescription = (exprText) => {
  const match = exprText.match(/\.describe\((['"`])([\s\S]*?)\1\)/);
  return match ? match[2].replace(/\s+/g, ' ').trim() : null;
};

const extractDefault = (exprText) => {
  const match = exprText.match(/\.default\(([^)]+)\)/);
  if (!match) {
    return null;
  }

  return match[1].replace(/\s+/g, ' ').trim();
};

const extractEnumValues = (exprText) => {
  const match = exprText.match(/z\.enum\(\[([\s\S]*?)\]\)/);
  if (!match) {
    return null;
  }

  const raw = match[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/^['"]|['"]$/g, ''));

  return raw.length ? raw : null;
};

const parseInputSchema = (obj) => {
  const inputSchemaProp = getObjectProperty(obj, 'inputSchema');
  if (!inputSchemaProp || !ts.isPropertyAssignment(inputSchemaProp)) {
    return [];
  }

  if (!ts.isObjectLiteralExpression(inputSchemaProp.initializer)) {
    return [];
  }

  const params = [];

  for (const prop of inputSchemaProp.initializer.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      continue;
    }

    const paramName = ts.isIdentifier(prop.name)
      ? prop.name.text
      : ts.isStringLiteral(prop.name)
        ? prop.name.text
        : null;

    if (!paramName) {
      continue;
    }

    const expressionText = getNodeText(prop.initializer);
    const description = extractDescription(expressionText);
    const defaultValue = extractDefault(expressionText);
    const enumValues = extractEnumValues(expressionText);

    params.push({
      name: paramName,
      type: inferType(expressionText),
      required: !/\.optional\(/.test(expressionText),
      default: defaultValue,
      description,
      enumValues,
      schema: expressionText.replace(/\s+/g, ' ').trim()
    });
  }

  return params;
};

const tools = [];

const visit = (node) => {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'registerTool' &&
    node.arguments.length >= 2
  ) {
    const [nameArg, metadataArg] = node.arguments;

    if (
      (ts.isStringLiteral(nameArg) || ts.isNoSubstitutionTemplateLiteral(nameArg)) &&
      ts.isObjectLiteralExpression(metadataArg)
    ) {
      tools.push({
        name: nameArg.text,
        title: extractStringProperty(metadataArg, 'title') ?? nameArg.text,
        description: extractStringProperty(metadataArg, 'description') ?? '',
        annotations: parseAnnotations(metadataArg),
        parameters: parseInputSchema(metadataArg)
      });
    }
  }

  ts.forEachChild(node, visit);
};

visit(sourceFile);

tools.sort((a, b) => a.name.localeCompare(b.name));

const docsPayload = {
  generatedFrom: 'packages/scholar-mcp/src/mcp/create-scholar-mcp-server.ts',
  toolCount: tools.length,
  tools
};

const escapeMdxInline = (value) =>
  String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}');

const renderParamRow = (param) => {
  const type = param.enumValues?.length ? `${param.type} (${param.enumValues.join(', ')})` : param.type;
  return `| \`${escapeMdxInline(param.name)}\` | ${escapeMdxInline(type)} | ${param.required ? 'Yes' : 'No'} | ${escapeMdxInline(param.default ?? '-')} | ${escapeMdxInline(param.description ?? '-')} |`;
};

const renderToolSection = (tool) => {
  const lines = [];
  lines.push(`## \`${tool.name}\``);
  lines.push('');
  lines.push(escapeMdxInline(tool.description || 'No description provided.'));
  lines.push('');
  lines.push(`- **Title:** ${escapeMdxInline(tool.title)}`);
  if (Object.keys(tool.annotations).length > 0) {
    lines.push(`- **Annotations:** \`${JSON.stringify(tool.annotations)}\``);
  }
  lines.push('');

  if (tool.parameters.length === 0) {
    lines.push('This tool does not define input parameters.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('| Parameter | Type | Required | Default | Description |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const param of tool.parameters) {
    lines.push(renderParamRow(param));
  }
  lines.push('');

  return lines.join('\n');
};

const mdx = `---
title: MCP Tools Reference
description: Generated tool reference from source code.
sidebar:
  order: 2
---

> Auto-generated by \`scripts/generate-docs-api.mjs\` from \`packages/scholar-mcp/src/mcp/create-scholar-mcp-server.ts\`.

Total tools: **${tools.length}**.

${tools.map(renderToolSection).join('\n')}`;

mkdirSync(dirname(outputJsonPath), { recursive: true });
mkdirSync(dirname(outputMdxPath), { recursive: true });
writeFileSync(outputJsonPath, `${JSON.stringify(docsPayload, null, 2)}\n`, 'utf8');
writeFileSync(outputMdxPath, `${mdx}\n`, 'utf8');

process.stdout.write(`Generated MCP docs for ${tools.length} tools.\n`);
