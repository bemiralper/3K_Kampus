import fs from "fs";
import path from "path";

const templatesRoot = path.join(process.cwd(), "legacy-templates");

const urlMappings: Record<string, string> = {
  "dashboard": "/dashboard",
  "kurum:kurum_tanimlar": "/kurum-yonetimi/kurumlar",
  "egitim_tanimlari:tanimlar": "/egitim-tanimlari",
  "egitim_paketleri:paketler": "/egitim-paketleri",
  "ogrenci:ogrenci_listesi": "/ogrenciler",
  "ogrenci:ogrenci_detay": "/ogrenciler/1",
  "ogrenci:ogrenci_duzenle": "/ogrenciler/1/duzenle",
  "admin:index": "/admin",
  "admin:kurum_kurum_add": "/admin",
  "admin:ogrenci_ogrenci_add": "/admin",
  "admin:sinif_sinif_add": "/admin",
  "admin:sinif_sinif_changelist": "/admin",
  "admin:ogrenci_ogrencikayit_changelist": "/admin",
  "admin:personel_personel_changelist": "/admin",
  "admin:personel_kocatama_changelist": "/admin",
};

const defaultUrlVariables: Record<string, string> = {
  kurum_tanimlar_url: urlMappings["kurum:kurum_tanimlar"],
  egitim_tanimlari_url: urlMappings["egitim_tanimlari:tanimlar"],
  egitim_paketleri_url: urlMappings["egitim_paketleri:paketler"],
  ogrenci_listesi_url: urlMappings["ogrenci:ogrenci_listesi"],
  admin_index_url: urlMappings["admin:index"],
  sinif_list_url: urlMappings["admin:sinif_sinif_changelist"],
  ogrenci_kayit_list_url: urlMappings["admin:ogrenci_ogrencikayit_changelist"],
  personel_list_url: urlMappings["admin:personel_personel_changelist"],
  kocatama_list_url: urlMappings["admin:personel_kocatama_changelist"],
};

function readTemplate(relativePath: string): string {
  const fullPath = path.join(templatesRoot, relativePath);
  return fs.readFileSync(fullPath, "utf8");
}

function resolveIncludes(html: string): string {
  return html.replace(/\{%\s*include\s+'([^']+)'\s*%\}/g, (_, includePath: string) => {
    const included = readTemplate(includePath);
    return resolveIncludes(included);
  });
}

function extractBlock(html: string, blockName: string): string {
  const regex = new RegExp(`\\{%\\s*block\\s+${blockName}\\s*%\\}([\\s\\S]*?)\\{%\\s*endblock\\s*%\\}`);
  const match = html.match(regex);
  return match ? match[1].trim() : "";
}

function replaceBlock(html: string, blockName: string, content: string): string {
  const regex = new RegExp(`\\{%\\s*block\\s+${blockName}\\s*%\\}([\\s\\S]*?)\\{%\\s*endblock\\s*%\\}`);
  return html.replace(regex, content);
}

function removeIfElseBlocks(html: string): string {
  let output = html;
  const ifElsePattern = /\{%\s*if[^%]*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
  while (ifElsePattern.test(output)) {
    output = output.replace(ifElsePattern, "$1");
  }
  return output;
}

function replaceUrls(html: string): string {
  return html.replace(/\{%\s*url\s+'([^']+)'[^%]*%\}/g, (fullMatch, urlName: string) => {
    if (fullMatch.includes(" as ")) {
      return "";
    }
    return urlMappings[urlName] ?? "#";
  });
}

function replaceVariables(html: string): string {
  return html.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, variableName: string) => {
    const key = variableName.trim();
    return defaultUrlVariables[key] ?? "";
  });
}

function replaceStatic(html: string): string {
  return html.replace(/\{%\s*static\s+'([^']+)'\s*%\}/g, (_, assetPath: string) => `/${assetPath}`);
}

function stripDjangoTags(html: string): string {
  let output = html;
  output = output.replace(/\{%\s*load[^%]*%\}/g, "");
  output = output.replace(/\{%\s*csrf_token\s*%\}/g, "");
  output = replaceUrls(output);
  output = replaceStatic(output);
  output = output.replace(/\{%[^%]*%\}/g, "");
  return output;
}

function extractBody(html: string): string {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1] : html;
}

export function compileLegacyTemplate(relativeTemplatePath: string): string {
  const baseTemplate = resolveIncludes(readTemplate("layout/base.html"));
  const childTemplate = resolveIncludes(readTemplate(relativeTemplatePath));

  const title = extractBlock(childTemplate, "title") || "3K Kampüs LMS";
  const extraCss = extractBlock(childTemplate, "extra_css");
  const extraJs = extractBlock(childTemplate, "extra_js");
  const content = extractBlock(childTemplate, "content");

  let merged = baseTemplate;
  merged = replaceBlock(merged, "title", title);
  merged = replaceBlock(merged, "extra_css", extraCss);
  merged = replaceBlock(merged, "extra_js", extraJs);
  merged = replaceBlock(merged, "content", content);

  merged = removeIfElseBlocks(merged);
  merged = stripDjangoTags(merged);
  merged = replaceVariables(merged);
  merged = extractBody(merged);

  return merged;
}

function extractUrlAssignments(html: string): { html: string; context: LegacyContext } {
  const context: LegacyContext = {};
  const output = html.replace(/\{%\s*url\s+'([^']+)'\s+as\s+(\w+)\s*%\}/g, (_, urlName: string, varName: string) => {
    context[varName] = urlMappings[urlName] ?? "#";
    return "";
  });
  return { html: output, context };
}

function buildDefaultContext(data: LegacyContext): LegacyContext {
  const request = (data.request as Record<string, unknown>) ?? { path: "" };
  return {
    ...defaultUrlVariables,
    request,
    user: {
      first_name: "",
      username: "Kullanıcı",
      get_full_name: "Kullanıcı",
      ...(data.user as Record<string, unknown> | undefined),
    },
  };
}

type LegacyContext = Record<string, unknown>;

function resolveValue(pathExpression: string, context: LegacyContext): unknown {
  const pathParts = pathExpression.split(".").map((part) => part.trim()).filter(Boolean);
  let value: unknown = context;
  for (const part of pathParts) {
    if (value === null || value === undefined) return "";
    const index = Number(part);
    if (!Number.isNaN(index) && Array.isArray(value)) {
      value = value[index];
    } else if (Array.isArray(value) && part === "count") {
      value = value.length;
    } else if (Array.isArray(value) && part === "all") {
      value = value;
    } else if (!Number.isNaN(index) && typeof value === "string") {
      value = (value as string)[index] ?? "";
    } else if (typeof value === "object" && value !== null) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return "";
    }
  }
  return value ?? "";
}

function applyFilter(value: unknown, filterName: string, filterArg?: string): unknown {
  if (filterName === "upper") return String(value).toUpperCase();
  if (filterName === "lower") return String(value).toLowerCase();
  if (filterName === "length") return Array.isArray(value) ? value.length : String(value).length;
  if (filterName === "default") {
    const fallback = (filterArg ?? "").replace(/^['"]|['"]$/g, "");
    if (value === null || value === undefined || value === "") return fallback;
    return value;
  }
  if (filterName === "truncatewords") {
    const limit = Number((filterArg ?? "").replace(/"/g, ""));
    if (!limit || Number.isNaN(limit)) return value;
    const words = String(value).split(/\s+/).filter(Boolean);
    if (words.length <= limit) return value;
    return `${words.slice(0, limit).join(" ")}...`;
  }
  if (filterName === "add") {
    const delta = Number((filterArg ?? "").replace(/"/g, ""));
    const base = Number(value ?? 0);
    if (Number.isNaN(delta) || Number.isNaN(base)) return value;
    return base + delta;
  }
  if (filterName === "floatformat") {
    const digits = Number((filterArg ?? "").replace(/"/g, ""));
    const numberValue = Number(value ?? 0);
    if (Number.isNaN(numberValue)) return value;
    if (Number.isNaN(digits)) return numberValue.toString();
    return numberValue.toFixed(digits);
  }
  if (filterName === "intcomma") {
    const numberValue = Number(value ?? 0);
    if (Number.isNaN(numberValue)) return value;
    return numberValue.toLocaleString("tr-TR");
  }
  if (filterName === "slice") {
    const [startRaw, endRaw] = (filterArg ?? "").replace(/"/g, "").split(":");
    const start = startRaw ? Number(startRaw) : 0;
    const end = endRaw ? Number(endRaw) : undefined;
    return String(value).slice(start, end);
  }
  if (filterName === "date") {
    const dateValue = value ? new Date(String(value)) : null;
    if (!dateValue || Number.isNaN(dateValue.getTime())) return value ?? "";
    const day = String(dateValue.getDate()).padStart(2, "0");
    const month = String(dateValue.getMonth() + 1).padStart(2, "0");
    const year = dateValue.getFullYear();
    if (filterArg?.includes("d.m.Y H:i")) {
      const hours = String(dateValue.getHours()).padStart(2, "0");
      const minutes = String(dateValue.getMinutes()).padStart(2, "0");
      return `${day}.${month}.${year} ${hours}:${minutes}`;
    }
    if (filterArg?.includes("d.m.Y")) {
      return `${day}.${month}.${year}`;
    }
    return dateValue.toISOString();
  }
  return value;
}

function resolveExpression(expression: string, context: LegacyContext): unknown {
  const parts = expression.split("|").map((part) => part.trim()).filter(Boolean);
  const base = parts.shift() ?? "";
  let value = resolveValue(base, context);
  for (const filter of parts) {
    const [name, arg] = filter.split(":");
    value = applyFilter(value, name.trim(), arg?.trim());
  }
  return value;
}

function evaluateCondition(condition: string, context: LegacyContext): boolean {
  let expr = condition.trim();
  if (expr.startsWith("not ")) {
    return !evaluateCondition(expr.slice(4), context);
  }
  const equalityMatch = expr.match(/(.+?)(==|!=)(.+)/);
  if (equalityMatch) {
    const left = resolveExpression(equalityMatch[1].trim(), context);
    const rightRaw = equalityMatch[3].trim().replace(/^['"]|['"]$/g, "");
    const operator = equalityMatch[2];
    const leftValue = String(left);
    return operator === "==" ? leftValue === rightRaw : leftValue !== rightRaw;
  }
  const value = resolveExpression(expr, context);
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

function renderVariables(html: string, context: LegacyContext): string {
  return html.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expression: string) => {
    const value = resolveExpression(expression, context);
    return value === null || value === undefined ? "" : String(value);
  });
}

function renderIfBlocks(html: string, context: LegacyContext): string {
  const ifRegex = /\{%\s*if\s+([^%]+?)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/;
  let output = html;
  let match = output.match(ifRegex);
  while (match) {
    const fullMatch = match[0];
    const condition = match[1];
    const body = match[2];

    const segments: Array<{ condition?: string; content: string }> = [];
    let cursor = 0;
    const tagRegex = /\{%\s*(elif|else)\s*([^%]*?)\s*%\}/g;
    let tagMatch: RegExpExecArray | null = null;
    let currentCondition: string | undefined = condition;

    while ((tagMatch = tagRegex.exec(body)) !== null) {
      const content = body.slice(cursor, tagMatch.index);
      segments.push({ condition: currentCondition, content });
      if (tagMatch[1] === "elif") {
        currentCondition = tagMatch[2]?.trim();
      } else {
        currentCondition = undefined;
      }
      cursor = tagRegex.lastIndex;
    }

    segments.push({ condition: currentCondition, content: body.slice(cursor) });

    let rendered = "";
    for (const segment of segments) {
      if (!segment.condition || evaluateCondition(segment.condition, context)) {
        rendered = renderTemplate(segment.content, context);
        break;
      }
    }

    output = output.replace(fullMatch, rendered);
    match = output.match(ifRegex);
  }
  return output;
}

function renderForBlocks(html: string, context: LegacyContext): string {
  const forRegex = /\{%\s*for\s+(\w+)\s+in\s+([^%]+?)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/;
  let output = html;
  let match = output.match(forRegex);
  while (match) {
    const fullMatch = match[0];
    const itemName = match[1];
    const listExpression = match[2];
    const body = match[3];
    const list = resolveExpression(listExpression, context);
    const items = Array.isArray(list) ? list : [];
    const rendered = items
      .map((item) => renderTemplate(body, { ...context, [itemName]: item }))
      .join("");
    output = output.replace(fullMatch, rendered);
    match = output.match(forRegex);
  }
  return output;
}

function renderTemplate(html: string, context: LegacyContext): string {
  let output = html;
  output = renderForBlocks(output, context);
  output = renderIfBlocks(output, context);
  output = renderVariables(output, context);
  return output;
}

export function renderLegacyTemplate(relativeTemplatePath: string, data: LegacyContext): string {
  const baseTemplate = resolveIncludes(readTemplate("layout/base.html"));
  const childTemplate = resolveIncludes(readTemplate(relativeTemplatePath));

  const title = extractBlock(childTemplate, "title") || "3K Kampüs LMS";
  const extraCss = extractBlock(childTemplate, "extra_css");
  const extraJs = extractBlock(childTemplate, "extra_js");
  const content = extractBlock(childTemplate, "content");

  let merged = baseTemplate;
  merged = replaceBlock(merged, "title", title);
  merged = replaceBlock(merged, "extra_css", extraCss);
  merged = replaceBlock(merged, "extra_js", extraJs);
  merged = replaceBlock(merged, "content", content);

  const extracted = extractUrlAssignments(merged);
  const context = { ...buildDefaultContext(data), ...data, ...extracted.context };

  merged = replaceUrls(extracted.html);
  merged = replaceStatic(merged);
  merged = renderTemplate(merged, context);
  merged = stripDjangoTags(merged);
  merged = extractBody(merged);

  return merged;
}
