window.__ModuleLoader__.load({
	id: "dsh-vault",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  I18nContext: () => I18nContext,
  VaultApi: () => VaultApi,
  VaultApp: () => VaultApp,
  VaultSection: () => VaultSection,
  apply: () => apply,
  createVaultSection: () => createVaultSection,
  dictionaries: () => dictionaries,
  inject: () => inject,
  name: () => name,
  translate: () => translate
});
module.exports = __toCommonJS(index_exports);
var import_react13 = require("react");

// src/client/VaultApp.tsx
var import_react12 = require("react");

// src/client/api.ts
var BASE = "/api/dsh-vault";
var VaultApiError = class extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "VaultApiError";
  }
};
async function request(path, init) {
  const { acceptConflictBody, ...fetchInit } = init ?? {};
  const res = await fetch(`${BASE}${path}`, {
    ...fetchInit,
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "x-dsh-vault-request": "1",
      ...fetchInit.body ? { "content-type": "application/json" } : {},
      ...fetchInit.headers
    }
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new VaultApiError(text || `HTTP ${res.status}`, res.status);
  }
  if (res.status === 409 && acceptConflictBody && body && typeof body === "object" && "snapshotId" in body) {
    return body;
  }
  if (!res.ok) {
    const msg = body && typeof body === "object" && "error" in body ? String(body.error) : `HTTP ${res.status}`;
    const code = body && typeof body === "object" && "code" in body ? String(body.code) : void 0;
    throw new VaultApiError(msg, res.status, code);
  }
  return body;
}
function hasConflicts(conflicts) {
  return Boolean(conflicts) && Object.keys(conflicts).length > 0;
}
var VaultApi = class {
  startBackupJob(body) {
    return request("/jobs/backup", { method: "POST", body: JSON.stringify(body) });
  }
  startRestoreJob(body) {
    return request("/jobs/restore", { method: "POST", body: JSON.stringify(body) });
  }
  startRetryPluginsJob(plugins) {
    return request("/jobs/retry-plugins", { method: "POST", body: JSON.stringify(plugins ? { plugins } : {}) });
  }
  /** A job by id, or the running / most recent one. */
  getJob(id) {
    return request(id ? `/jobs?id=${encodeURIComponent(id)}` : "/jobs");
  }
  listPlugins(checkRegistry = true) {
    return request(`/plugins?registry=${checkRegistry ? "1" : "0"}`);
  }
  status() {
    return request("/status");
  }
  dismissUnfinishedRestore() {
    return request("/restore/unfinished/dismiss", { method: "POST", body: "{}" });
  }
  getSettings() {
    return request("/settings");
  }
  updateSettings(patch) {
    return request("/settings", { method: "PUT", body: JSON.stringify(patch) });
  }
  listTargets() {
    return request("/targets");
  }
  upsertTarget(target) {
    return request("/targets", { method: "POST", body: JSON.stringify(target) });
  }
  deleteTarget(id) {
    return request("/targets/delete", { method: "POST", body: JSON.stringify({ id }) });
  }
  backup(body) {
    return request("/backup", { method: "POST", body: JSON.stringify(body) });
  }
  listFs(path) {
    return request(`/fs/list?path=${encodeURIComponent(path)}`);
  }
  mkdir(path, name2) {
    return request("/fs/mkdir", { method: "POST", body: JSON.stringify({ path, name: name2 }) });
  }
  pickDirectory() {
    return request("/fs/pick-directory", { method: "POST", body: "{}" });
  }
  listSnapshots(targetId) {
    const q = targetId ? `?targetId=${encodeURIComponent(targetId)}` : "";
    return request(`/snapshots${q}`);
  }
  deleteSnapshot(targetId, snapshotId) {
    return request("/snapshots/delete", { method: "POST", body: JSON.stringify({ targetId, snapshotId }) });
  }
  verify(targetId, snapshotId, password) {
    return request("/verify", { method: "POST", body: JSON.stringify({ targetId, snapshotId, password }) });
  }
  /**
   * Preview a restore diff. When `conflict` is set, every item in the response
   * carries a `resolution` for that path (global default + optional overrides).
   */
  previewRestore(targetId, snapshotId, password, conflict, conflicts, importPath) {
    return request("/restore/preview", {
      method: "POST",
      body: JSON.stringify({
        targetId,
        snapshotId,
        importPath,
        password,
        ...conflict ? { conflict } : {},
        ...hasConflicts(conflicts) ? { conflicts } : {}
      })
    });
  }
  restore(body) {
    return request("/restore", { method: "POST", body: JSON.stringify(body), acceptConflictBody: true });
  }
  /** Re-attempt only the given failed plugins (or all failed ones of the last restore). */
  retryPlugins(plugins) {
    return request("/restore/retry-plugins", { method: "POST", body: JSON.stringify(plugins ? { plugins } : {}), acceptConflictBody: true });
  }
  getSchedule() {
    return request("/schedule");
  }
  updateSchedule(patch) {
    return request("/schedule", { method: "PUT", body: JSON.stringify(patch) });
  }
  runSchedule() {
    return request("/schedule/run", { method: "POST", body: "{}" });
  }
};

// src/client/lib/format.ts
function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < units.length - 1);
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
function localeTag(locale) {
  return locale && /^zh/i.test(locale) ? "zh-CN" : "en-US";
}
function formatDateTime(iso, locale) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(localeTag(locale), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
}
function formatWhen(iso, locale) {
  return formatDateTime(iso, locale);
}
function relativeLabel(tr, iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const delta = t - now;
  const abs = Math.abs(delta);
  const mins = Math.round(abs / 6e4);
  if (mins < 1) return tr("time.justNow");
  if (mins < 60) {
    return delta < 0 ? tr("time.minutesAgo", { n: mins }) : tr("time.inMinutes", { n: mins });
  }
  const hours = Math.round(mins / 60);
  if (hours < 48) {
    return delta < 0 ? tr("time.hoursAgo", { n: hours }) : tr("time.inHours", { n: hours });
  }
  const days = Math.round(hours / 24);
  return delta < 0 ? tr("time.daysAgo", { n: days }) : tr("time.inDays", { n: days });
}
function scheduleLabel(locale, intervalMinutes) {
  const zh3 = Boolean(locale && /^zh/i.test(locale));
  const m = Math.max(1, Math.round(intervalMinutes) || 1);
  if (m < 60) return zh3 ? `\u6BCF ${m} \u5206\u949F` : `every ${m} min`;
  if (m % 1440 === 0) {
    const d = m / 1440;
    return zh3 ? d === 1 ? "\u6BCF\u5929" : `\u6BCF ${d} \u5929` : d === 1 ? "daily" : `every ${d} days`;
  }
  if (m % 60 === 0) {
    const h = m / 60;
    return zh3 ? h === 1 ? "\u6BCF\u5C0F\u65F6" : `\u6BCF ${h} \u5C0F\u65F6` : h === 1 ? "hourly" : `every ${h} hours`;
  }
  return zh3 ? `\u6BCF ${m} \u5206\u949F` : `every ${m} min`;
}
function passwordStrength(password) {
  if (!password) return { level: 0, score: 0 };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const level = Math.min(4, score);
  return { level, score };
}
function targetName(target, tr, fallback = "") {
  if (!target) return fallback;
  return target.kind === "local" && target.label === "Local folder" ? tr("storage.kind.local") : target.label;
}

// src/client/components/Dashboard.tsx
var import_react3 = require("react");

// src/client/i18n.ts
var import_react = require("react");
var zh = {
  // section
  "section.label": "\u5927\u80A5\u9C7C\u5907\u4EFD",
  "section.title": "\u5927\u80A5\u9C7C\u5907\u4EFD",
  "section.description": "\u5907\u4EFD\u5E76\u6062\u590D dsh \u7684\u63D2\u4EF6\u3001MCP\u3001\u6280\u80FD\u3001\u8BBE\u7F6E\u4E0E\u914D\u7F6E\u6863\u6848\u3002",
  "section.tabs": "\u5927\u80A5\u9C7C\u5907\u4EFD \u5206\u533A",
  "section.tab.overview": "\u6982\u89C8",
  "section.tab.backup": "\u5907\u4EFD",
  "section.tab.restore": "\u6062\u590D",
  "section.tab.storage": "\u5B58\u50A8\u4F4D\u7F6E",
  "section.tab.snapshots": "\u5FEB\u7167",
  "section.tab.schedule": "\u81EA\u52A8\u5907\u4EFD",
  // common
  "app.showPassword": "\u663E\u793A\u5BC6\u7801",
  "app.hidePassword": "\u9690\u85CF\u5BC6\u7801",
  "app.cancel": "\u53D6\u6D88",
  "app.retry": "\u91CD\u8BD5",
  "app.loading": "\u6B63\u5728\u52A0\u8F7D\u2026",
  "app.error": "\u52A0\u8F7D\u5931\u8D25",
  "app.refresh": "\u5237\u65B0",
  "common.never": "\u4ECE\u672A",
  "common.none": "\u65E0",
  "common.on": "\u5F00",
  "common.off": "\u5173",
  "common.optional": "\uFF08\u53EF\u9009\uFF09",
  "common.encrypted": "\u5DF2\u52A0\u5BC6",
  "common.plaintext": "\u660E\u6587",
  "error.path.private": "\u8FD9\u662F\u5927\u80A5\u9C7C\u5907\u4EFD\u81EA\u5DF1\u7684\u79C1\u6709\u6570\u636E\u76EE\u5F55\uFF0C\u4E0D\u80FD\u6D4F\u89C8\u6216\u9009\u62E9\uFF1A{path}",
  "error.path.credentials": "\u51ED\u636E\u76EE\u5F55\uFF08\u5982 .ssh\u3001.aws\uFF09\u4E0D\u80FD\u6D4F\u89C8\u6216\u9009\u62E9\uFF1A{path}",
  "error.path.system": "\u7CFB\u7EDF\u76EE\u5F55\u4E0D\u80FD\u9009\u62E9\uFF1A{path}",
  "error.path.outside": "\u53EA\u80FD\u9009\u62E9\u4E3B\u76EE\u5F55\u3001\u5916\u63A5/\u5176\u4ED6\u78C1\u76D8\uFF0C\u6216\u5728\u7CFB\u7EDF\u5BF9\u8BDD\u6846\u91CC\u9009\u8FC7\u7684\u6587\u4EF6\u5939\uFF1A{path}",
  "error.path.notArchive": "\u53EA\u80FD\u5BFC\u5165 .tar.gz / .dshvault \u5FEB\u7167\u6587\u4EF6\uFF0C\u6216\u5FEB\u7167\u6587\u4EF6\u5939\uFF1A{path}",
  "error.path.relative": "\u8BF7\u586B\u5199\u5B8C\u6574\u8DEF\u5F84\uFF1A{path}",
  "error.badSnapshot": "\u8FD9\u4E0D\u662F\u6709\u6548\u7684\u5927\u80A5\u9C7C\u5907\u4EFD\u5FEB\u7167\uFF08\u6587\u4EF6\u635F\u574F\uFF0C\u6216\u4E0D\u662F\u5FEB\u7167\u5F52\u6863\uFF09",
  "error.noSnapshotInFolder": "\u8FD9\u4E2A\u6587\u4EF6\u5939\u91CC\u6CA1\u6709\u5FEB\u7167\uFF1A\u9700\u8981 .tar.gz / .dshvault \u6587\u4EF6\uFF0C\u6216\u89E3\u538B\u540E\u7684\u5FEB\u7167\uFF08\u542B manifest.json \u548C files/\uFF09",
  "common.secrets": "\u542B\u51ED\u636E",
  "common.verify": "\u6821\u9A8C",
  "common.delete": "\u5220\u9664",
  "common.default": "\u9ED8\u8BA4",
  "common.allTargets": "\u5168\u90E8\u5B58\u50A8\u4F4D\u7F6E",
  "restore.rollbackTarget": "\u56DE\u6EDA\u5FEB\u7167\uFF08\u6062\u590D\u524D\u81EA\u52A8\u751F\u6210\uFF09",
  "common.target": "\u5B58\u50A8\u4F4D\u7F6E",
  "common.snapshot": "\u5FEB\u7167",
  "common.size": "\u5927\u5C0F",
  "common.createdAt": "\u521B\u5EFA\u65F6\u95F4",
  "common.notes": "\u5907\u6CE8",
  "common.save": "\u4FDD\u5B58",
  // storage kinds
  "kind.local": "\u672C\u5730\u76EE\u5F55",
  "kind.github": "GitHub",
  "kind.webdav": "WebDAV",
  "kind.s3": "S3 \u517C\u5BB9",
  "kind.localPlain": "\u672C\u5730\u660E\u6587",
  "kind.localEnc": "\u672C\u5730\u52A0\u5BC6",
  // overview
  "overview.desc": "\u5F53\u524D\u5907\u4EFD\u72B6\u6001\u3002",
  "overview.lastTitle": "\u4E0A\u6B21\u5907\u4EFD",
  "overview.lastEmpty": "\u8FD8\u6CA1\u6709\u5FEB\u7167",
  "overview.lastValue": "{target} \xB7 {time}",
  "overview.snapshotsTitle": "\u5FEB\u7167",
  "overview.snapshotsValue": "{count} \u4E2A \xB7 {size}",
  "overview.snapshotsEmpty": "\u6682\u65E0\u5FEB\u7167",
  "overview.snapshotsDesc": "{encrypted} \u4E2A\u52A0\u5BC6\uFF0C{plain} \u4E2A\u660E\u6587",
  "overview.noTargets": "\u5C1A\u672A\u6DFB\u52A0\u5B58\u50A8\u4F4D\u7F6E",
  "overview.scheduleTitle": "\u81EA\u52A8\u5907\u4EFD",
  "overview.scheduleOff": "\u672A\u5F00\u542F",
  "overview.scheduleValue": "{interval}\uFF0C\u4E0B\u6B21 {time}",
  "overview.scheduleNoNext": "{interval}\uFF0C\u7B49\u5F85\u4E0B\u6B21\u8FD0\u884C",
  "overview.backupRow": "\u7ACB\u5373\u5907\u4EFD",
  "overview.backupButton": "\u5907\u4EFD",
  "overview.backupDesc": "\u4F7F\u7528\u5907\u4EFD\u9875\u5F53\u524D\u7684\u8BBE\u7F6E\u521B\u5EFA\u5FEB\u7167\u3002",
  "overview.backupDescTarget": "\u5907\u4EFD\u5230\u300C{target}\u300D\u3002",
  "overview.targetsTitle": "\u5B58\u50A8\u4F4D\u7F6E",
  "overview.securityTitle": "\u51ED\u636E",
  "overview.secretsNote": "\u51ED\u636E\u6587\u4EF6\u9ED8\u8BA4\u4E0D\u5907\u4EFD\uFF1B\u53EA\u6709\u52A0\u5BC6\u5E76\u8F93\u5165\u5BC6\u7801\u7684\u5FEB\u7167\u624D\u5305\u542B\u3002",
  "overview.emptyTitle": "\u8FD8\u6CA1\u6709\u5B58\u50A8\u4F4D\u7F6E",
  "overview.emptyBody": "\u5148\u5728\u300C\u5B58\u50A8\u4F4D\u7F6E\u300D\u6DFB\u52A0\u672C\u5730\u76EE\u5F55\u6216\u4E91\u7AEF\u5B58\u50A8\u3002",
  "overview.goStorage": "\u6DFB\u52A0\u5B58\u50A8\u4F4D\u7F6E",
  // backup
  "backup.desc": "\u9009\u62E9\u5907\u4EFD\u8303\u56F4\u3001\u5B58\u50A8\u4F4D\u7F6E\u548C\u52A0\u5BC6\u65B9\u5F0F\uFF0C\u7136\u540E\u521B\u5EFA\u5FEB\u7167\u3002",
  "backup.noTargetsTitle": "\u8FD8\u6CA1\u6709\u5B58\u50A8\u4F4D\u7F6E",
  "backup.noTargetsBody": "\u8BF7\u5148\u6DFB\u52A0\u4E00\u4E2A\u5B58\u50A8\u4F4D\u7F6E\uFF0C\u518D\u521B\u5EFA\u5FEB\u7167\u3002",
  "backup.goStorage": "\u524D\u5F80\u5B58\u50A8\u4F4D\u7F6E",
  "backup.targetTitle": "\u5B58\u50A8\u4F4D\u7F6E",
  "backup.targetDesc": "\u5FEB\u7167\u5199\u5165\u7684\u4F4D\u7F6E\u3002",
  "backup.targetEncBadge": "\u9ED8\u8BA4\u52A0\u5BC6",
  "backup.destMode": "\u5199\u5165\u65B9\u5F0F",
  "backup.destModeDesc": "\u5DF2\u914D\u7F6E\u7684\u5B58\u50A8\u4F4D\u7F6E\u3001\u4EFB\u610F\u672C\u5730\u6587\u4EF6\u5939\uFF0C\u6216\u5BFC\u51FA\u5355\u4E2A\u53EF\u79FB\u690D\u5F52\u6863\u6587\u4EF6\u3002",
  "backup.dest.target": "\u5DF2\u914D\u7F6E\u7684\u5B58\u50A8\u4F4D\u7F6E",
  "backup.dest.directory": "\u4EFB\u610F\u672C\u5730\u6587\u4EF6\u5939",
  "backup.dest.file": "\u5BFC\u51FA\u5230\u6587\u4EF6",
  "backup.directory": "\u6587\u4EF6\u5939\u8DEF\u5F84",
  "backup.directoryHint": "\u53EF\u7528\u76D8\u7B26\u8DEF\u5F84\uFF08\u5982 D:\\Backups\uFF09\u3001USB \u6216\u540C\u6B65\u76D8\uFF1BWindows cmd \u8BF7\u7528\u5B8C\u6574\u8DEF\u5F84\uFF0C\u4E0D\u8981\u7528 ~\u3002",
  "backup.directoryPlaceholder": "\u4F8B\u5982 C:\\Users\\\u4F60\\Backups \u6216 /Volumes/USB/dsh",
  "backup.exportFile": "\u5BFC\u51FA\u6587\u4EF6\u8DEF\u5F84",
  "backup.exportFileHint": "\u5355\u4E2A .tar.gz\uFF08\u660E\u6587\uFF09\u6216 .dshvault\uFF08\u52A0\u5BC6\uFF09\u5F52\u6863\uFF1B\u53EF\u62F7\u5230\u53E6\u4E00\u53F0\u673A\u5668\u518D\u5BFC\u5165\u3002",
  "backup.exportFilePlaceholder": "\u4F8B\u5982 D:\\dsh-backup.dshvault",
  "backup.browse": "\u6D4F\u89C8\u2026",
  "backup.scopeTitle": "\u5907\u4EFD\u8303\u56F4",
  "backup.scopeDesc": "\u9009\u4E2D\u7684\u7C7B\u522B\u4F1A\u5199\u5165\u5FEB\u7167\u3002",
  "backup.scopeSummary": "\u5DF2\u9009 {selected}/{total} \u9879",
  "backup.scopeAll": "\u5168\u9009",
  "backup.scopeNone": "\u5168\u4E0D\u9009",
  "backup.cat.plugins": "\u63D2\u4EF6",
  "backup.cat.plugins.desc": "\u63D2\u4EF6\u4F9D\u8D56\u4E0E cordis patch",
  "backup.cat.plugin-config": "\u63D2\u4EF6\u914D\u7F6E",
  "backup.cat.plugin-config.desc": "\u63D2\u4EF6\u6570\u636E\u4E0E profile \u76EE\u5F55",
  "backup.cat.mcp": "MCP",
  "backup.cat.mcp.desc": "mcp.json \u4E0E MCP \u670D\u52A1",
  "backup.cat.skills": "\u6280\u80FD",
  "backup.cat.skills.desc": "dsh \u4E0E agents \u7684 skills \u76EE\u5F55",
  "backup.cat.settings": "\u8BBE\u7F6E",
  "backup.cat.settings.desc": "settings.yaml",
  "backup.cat.providers": "\u6A21\u578B\u670D\u52A1",
  "backup.cat.providers.desc": "\u670D\u52A1\u5546\u4E0E API \u914D\u7F6E",
  "backup.cat.agent-presets": "\u667A\u80FD\u4F53\u9884\u8BBE",
  "backup.cat.agent-presets.desc": "agent presets \u76EE\u5F55",
  "backup.cat.profiles": "\u914D\u7F6E\u6863\u6848",
  "backup.cat.profiles.desc": "profiles/**\uFF08\u4E0D\u542B node_modules\uFF09",
  "backup.cat.instructions": "\u6307\u4EE4\u6587\u4EF6",
  "backup.cat.instructions.desc": "AGENTS.md",
  "backup.cat.plugin-data": "\u63D2\u4EF6\u6570\u636E\uFF08.dsh \u4E0B\u5404\u63D2\u4EF6\u76EE\u5F55\uFF09",
  "backup.cat.plugin-data.desc": "$DSH_HOME \u4E0B\u5404\u63D2\u4EF6\u81EA\u5DF1\u7684\u76EE\u5F55\u4E0E\u6587\u4EF6\uFF08\u4E0D\u542B sessions\u3001attachments\u3001node_modules\u3001\u7F13\u5B58\uFF09",
  "backup.cat.plugin-data.found": "\u68C0\u6D4B\u5230\uFF1A{list}",
  "backup.cat.plugin-data.none": "\u672A\u68C0\u6D4B\u5230\u63D2\u4EF6\u6570\u636E\u76EE\u5F55",
  "backup.cat.credentials": "\u51ED\u636E",
  "backup.cat.credentials.desc": ".credentials.yaml\uFF08\u4EC5\u52A0\u5BC6\u65F6\uFF09",
  "backup.cat.credentials.plainBlocked": "\u53EA\u6709\u52A0\u5BC6\u5907\u4EFD\u624D\u80FD\u5305\u542B\u51ED\u636E\u3002\u6253\u5F00\u4E0B\u65B9\u7684\u201C\u52A0\u5BC6\u201D\u540E\u53EF\u9009\u3002",
  "backup.encTitle": "\u52A0\u5BC6",
  "backup.encDesc": "scrypt + AES-256-GCM\u3002\u9002\u5408\u4E91\u7AEF\u6216\u5171\u4EAB\u5B58\u50A8\u3002",
  "backup.password": "\u52A0\u5BC6\u5BC6\u7801",
  "backup.passwordPlaceholder": "\u8F93\u5165\u5BC6\u7801",
  "backup.passwordHint": "\u5BC6\u7801\u4E0D\u4F1A\u4FDD\u5B58\uFF0C\u6062\u590D\u65F6\u9700\u8981\u91CD\u65B0\u8F93\u5165\u3002",
  "backup.passwordRequired": "\u52A0\u5BC6\u5FEB\u7167\u9700\u8981\u5BC6\u7801\u3002",
  "backup.strength": "\u5F3A\u5EA6\uFF1A{level}",
  "backup.strength.0": "\u672A\u8F93\u5165",
  "backup.strength.1": "\u5F31",
  "backup.strength.2": "\u4E00\u822C",
  "backup.strength.3": "\u826F\u597D",
  "backup.strength.4": "\u5F88\u5F3A",
  "backup.secretsTitle": "\u5305\u542B\u51ED\u636E\u6587\u4EF6",
  "backup.secretsDesc": "\u4EC5\u52A0\u5BC6\u5FEB\u7167\u53EF\u5305\u542B\uFF1B\u51ED\u636E\u53EA\u5B58\u5728\u4E8E\u52A0\u5BC6\u8D1F\u8F7D\u4E2D\u3002",
  "backup.secretsBlocked": "\u9700\u5148\u5F00\u542F\u52A0\u5BC6\u3002",
  "backup.notes": "\u5907\u6CE8",
  "backup.notesPlaceholder": "\u53EF\u9009\uFF0C\u4F8B\u5982\u300C\u5347\u7EA7\u524D\u300D",
  "backup.submit": "\u521B\u5EFA\u5FEB\u7167",
  "backup.submitting": "\u6B63\u5728\u5907\u4EFD\u2026",
  "backup.progress": "\u6B63\u5728\u521B\u5EFA\u5FEB\u7167",
  "backup.progressStage": "\u6B63\u5728\u521B\u5EFA\u5FEB\u7167\uFF08{stage}\uFF09",
  "backup.progress.collect": "\u6536\u96C6\u6587\u4EF6",
  "backup.progress.pack": "\u6253\u5305",
  "backup.progress.encrypt": "\u52A0\u5BC6",
  "backup.progress.upload": "\u4E0A\u4F20",
  "backup.successTitle": "\u5DF2\u521B\u5EFA\u5FEB\u7167 {id}",
  "backup.failedTitle": "\u5907\u4EFD\u5931\u8D25",
  "backup.noScope": "\u8BF7\u81F3\u5C11\u9009\u62E9\u4E00\u4E2A\u5907\u4EFD\u7C7B\u522B\u3002",
  "backup.done": "\u5B8C\u6210",
  // restore
  "restore.desc": "\u5148\u9884\u89C8\u5DEE\u5F02\u5E76\u9010\u9879\u786E\u8BA4\u51B2\u7A81\uFF0C\u518D\u6267\u884C\u6062\u590D\u3002\u53EF\u4ECE\u5DF2\u914D\u7F6E\u5B58\u50A8\u4F4D\u7F6E\uFF0C\u6216\u4EFB\u610F\u6587\u4EF6\u5939 / \u5F52\u6863\u6587\u4EF6\u5BFC\u5165\u3002",
  "restore.sourceTitle": "\u6062\u590D\u6765\u6E90",
  "restore.sourceDesc": "\u5DF2\u914D\u7F6E\u7684\u5FEB\u7167\uFF0C\u6216\u4ECE\u5176\u4ED6\u673A\u5668\u62F7\u8D1D\u7684\u6587\u4EF6\u5939 / \u5355\u4E2A\u5F52\u6863\u6587\u4EF6\u3002",
  "restore.sourceMode": "\u6765\u6E90",
  "restore.sourceModeDesc": "\u4E0D\u5FC5\u5148\u521B\u5EFA\u5B58\u50A8\u4F4D\u7F6E\u5373\u53EF\u4ECE\u8DEF\u5F84\u5BFC\u5165\u3002",
  "restore.source.target": "\u5DF2\u914D\u7F6E\u7684\u5B58\u50A8\u4F4D\u7F6E",
  "restore.source.import": "\u4ECE\u6587\u4EF6\u5939\u6216\u6587\u4EF6\u5BFC\u5165",
  "restore.importPath": "\u5BFC\u5165\u8DEF\u5F84",
  "restore.importPathHint": "\u5FEB\u7167\u6587\u4EF6\u5939\uFF0C\u6216\u5355\u4E2A .tar.gz / .dshvault \u6587\u4EF6\u3002\u652F\u6301 Windows \u76D8\u7B26\u4E0E\u7A7A\u683C\u8DEF\u5F84\u3002",
  "restore.importPathPlaceholder": "\u4F8B\u5982 D:\\from-machine1\\snap \u6216 C:\\Users\\\u4F60\\export.dshvault",
  "restore.importPasswordHint": "\u82E5\u5F52\u6863\u5DF2\u52A0\u5BC6\u5219\u586B\u5199\u5BC6\u7801\uFF1B\u660E\u6587\u53EF\u7559\u7A7A\u3002",
  "restore.browse": "\u6D4F\u89C8\u2026",
  "picker.title.directory": "\u9009\u62E9\u6587\u4EF6\u5939",
  "picker.title.open": "\u9009\u62E9\u5907\u4EFD\u6587\u4EF6\u6216\u5FEB\u7167\u6587\u4EF6\u5939",
  "picker.title.save": "\u9009\u62E9\u5BFC\u51FA\u4F4D\u7F6E",
  "picker.roots": "\u78C1\u76D8",
  "picker.home": "\u4E3B\u76EE\u5F55",
  "picker.up": "\u4E0A\u4E00\u7EA7",
  "picker.newFolder": "\u65B0\u5EFA\u6587\u4EF6\u5939",
  "picker.newFolderName": "\u6587\u4EF6\u5939\u540D\u79F0",
  "picker.create": "\u521B\u5EFA",
  "picker.path": "\u5F53\u524D\u8DEF\u5F84",
  "picker.go": "\u524D\u5F80",
  "picker.loading": "\u6B63\u5728\u8BFB\u53D6\u2026",
  "picker.empty": "\u6B64\u6587\u4EF6\u5939\u4E3A\u7A7A",
  "picker.showHidden": "\u663E\u793A\u9690\u85CF\u9879",
  "picker.archiveOnly": "\u4EC5\u663E\u793A\u6587\u4EF6\u5939\u4E0E .tar.gz / .dshvault \u5F52\u6863",
  "picker.fileName": "\u6587\u4EF6\u540D",
  "picker.selectFolder": "\u9009\u62E9\u6B64\u6587\u4EF6\u5939",
  "picker.selectFile": "\u9009\u62E9\u6587\u4EF6",
  "picker.saveHere": "\u4FDD\u5B58\u5230\u6B64\u5904",
  "picker.native": "\u7CFB\u7EDF\u5BF9\u8BDD\u6846\u2026",
  "picker.nativeFailed": "\u7CFB\u7EDF\u5BF9\u8BDD\u6846\u4E0D\u53EF\u7528\uFF1A{error}",
  "restore.snapshotTitle": "\u5FEB\u7167",
  "restore.snapshotDesc": "{count} \u4E2A\u53EF\u7528\uFF0C\u6700\u65B0\u7684\u6392\u5728\u6700\u524D\u3002",
  "restore.select": "\u8981\u6062\u590D\u7684\u5FEB\u7167",
  "restore.filterTarget": "\u6309\u5B58\u50A8\u4F4D\u7F6E\u7B5B\u9009",
  "restore.search": "\u641C\u7D22\u5FEB\u7167 ID \u6216\u5907\u6CE8",
  "restore.password": "\u89E3\u5BC6\u5BC6\u7801",
  "restore.passwordHint": "\u8BE5\u5FEB\u7167\u5DF2\u52A0\u5BC6\u3002",
  "restore.passwordRequired": "\u8BF7\u8F93\u5165\u5BC6\u7801\u540E\u518D\u9884\u89C8\u3002",
  "restore.preview": "\u9884\u89C8\u5DEE\u5F02",
  "restore.previewing": "\u6B63\u5728\u5206\u6790\u5DEE\u5F02\u2026",
  "restore.emptyTitle": "\u6CA1\u6709\u53EF\u6062\u590D\u7684\u5FEB\u7167",
  "restore.emptyBody": "\u5148\u5728\u300C\u5907\u4EFD\u300D\u4E2D\u521B\u5EFA\u5FEB\u7167\u3002",
  "restore.noMatch": "\u6CA1\u6709\u5339\u914D\u7684\u5FEB\u7167\u3002",
  "restore.noTargetsTitle": "\u8FD8\u6CA1\u6709\u5B58\u50A8\u4F4D\u7F6E",
  "restore.noTargetsBody": "\u8BF7\u5148\u6DFB\u52A0\u4E00\u4E2A\u5B58\u50A8\u4F4D\u7F6E\u3002",
  "restore.diffTitle": "\u53D8\u66F4\u9884\u89C8",
  "restore.diffDesc": "\u65B0\u589E {added} \xB7 \u4FEE\u6539 {changed} \xB7 \u5220\u9664 {removed} \xB7 \u672A\u53D8 {unchanged}",
  "restore.filter.all": "\u5168\u90E8",
  "restore.filter.add": "\u65B0\u589E",
  "restore.filter.change": "\u4FEE\u6539",
  "restore.filter.remove": "\u5220\u9664",
  "restore.filter.unchanged": "\u672A\u53D8",
  "restore.added": "\u65B0\u589E",
  "restore.changed": "\u4FEE\u6539",
  "restore.removed": "\u5220\u9664",
  "restore.unchanged": "\u672A\u53D8",
  "restore.path": "\u8DEF\u5F84",
  "restore.category": "\u7C7B\u522B",
  "restore.change": "\u53D8\u66F4",
  "restore.resolution": "\u7ED3\u679C",
  "restore.diffEmpty": "\u6CA1\u6709\u9700\u8981\u5E94\u7528\u7684\u53D8\u66F4\uFF0C\u5F53\u524D\u914D\u7F6E\u4E0E\u5FEB\u7167\u4E00\u81F4\u3002",
  "restore.truncated": "\u4EC5\u663E\u793A\u524D {shown} \u9879\u3002",
  "restore.removedNote": "\u300C\u5220\u9664\u300D\u9879\u53EA\u505A\u63D0\u793A\uFF0C\u4E0D\u4F1A\u5220\u9664\u672C\u5730\u6587\u4EF6\u3002",
  "restore.conflictTitle": "\u51B2\u7A81\u5904\u7406",
  "restore.conflictDesc": "\u9010\u9879\u9009\u62E9\u4F7F\u7528\u5907\u4EFD\u5185\u5BB9\u8FD8\u662F\u4FDD\u7559\u5F53\u524D\u5185\u5BB9\u3002",
  "restore.conflictsSummary": "\u4F7F\u7528\u5907\u4EFD {use} \u9879\uFF0C\u4FDD\u7559\u5F53\u524D {keep} \u9879",
  "restore.bulk": "\u7EDF\u4E00\u8BBE\u7F6E",
  "restore.useBackup": "\u4F7F\u7528\u5907\u4EFD",
  "restore.perItem": "{path}\uFF1A\u5904\u7406\u65B9\u5F0F",
  "restore.keepCurrent": "\u4FDD\u7559\u5F53\u524D",
  "restore.willApply": "\u5C06\u5199\u5165",
  "restore.willSkip": "\u5C06\u8DF3\u8FC7",
  "restore.noChange": "\u4E0D\u5904\u7406",
  "restore.crossPlatformTitle": "\u5FEB\u7167\u6765\u81EA\u53E6\u4E00\u4E2A\u64CD\u4F5C\u7CFB\u7EDF",
  "restore.crossPlatformDesc": "\u5FEB\u7167\u6765\u81EA {source}\uFF0C\u5F53\u524D\u7CFB\u7EDF\u662F {target}\u3002\u8DE8\u7CFB\u7EDF\u6062\u590D\u4ECD\u4F1A\u8FD8\u539F\u914D\u7F6E\u548C\u5176\u4ED6\u63D2\u4EF6\uFF0C\u4F46\u6E90\u7CFB\u7EDF\u4E0A\u7684\u672C\u5730\u63D2\u4EF6\u8DEF\u5F84\u5728\u8FD9\u91CC\u65E0\u6CD5\u4F7F\u7528\u3002",
  "restore.crossPlatformLocalSources": "\u6CA1\u6709\u4FDD\u5B58\u526F\u672C\u7684\u672C\u5730\u63D2\u4EF6\u4F1A\u5355\u72EC\u5217\u51FA\u5E76\u8DF3\u8FC7\uFF0C\u4E0D\u5F71\u54CD npm / GitHub \u63D2\u4EF6\u548C\u914D\u7F6E\u6062\u590D\u3002",
  "restore.pluginsTitle": "\u9700\u8981\u91CD\u88C5\u7684\u63D2\u4EF6\uFF08{count}\uFF09",
  "restore.pluginsDesc": "\u6062\u590D\u65F6\u81EA\u52A8\u5C1D\u8BD5\u5B89\u88C5\u3002",
  "restore.manualTitle": "\u9700\u8981\u624B\u52A8\u5B8C\u6210\u7684\u64CD\u4F5C",
  "restore.confirmTitle": "\u786E\u8BA4\u6062\u590D",
  "restore.confirmDesc": "\u6062\u590D\u4F1A\u8986\u76D6\u73B0\u6709\u7684\u914D\u7F6E\uFF0C\u4E0E\u5FEB\u7167\u4E0D\u540C\u7684\u672C\u5730\u4FEE\u6539\u5C06\u4E22\u5931\u3002",
  "restore.rollback": "\u6062\u590D\u524D\u521B\u5EFA\u56DE\u6EDA\u5FEB\u7167",
  "restore.managePlugins": "\u81EA\u52A8\u91CD\u88C5\u7F3A\u5931\u63D2\u4EF6",
  "restore.submit": "\u6062\u590D",
  "restore.submitting": "\u6B63\u5728\u6062\u590D\u2026",
  "restore.needConfirm": "\u8BF7\u5148\u52FE\u9009\u786E\u8BA4\u3002",
  "restore.dialogTitle": "\u6062\u590D\u5FEB\u7167 {id}\uFF1F",
  "restore.dialogBody": "\u5C06\u5199\u5165 {apply} \u4E2A\u6587\u4EF6\uFF0C\u8DF3\u8FC7 {keep} \u9879\uFF0C{removed} \u9879\u5220\u9664\u4EC5\u63D0\u793A\u3002\u6B64\u64CD\u4F5C\u4F1A\u8986\u76D6\u672C\u5730\u914D\u7F6E\u3002",
  "restore.dialogConfirm": "\u786E\u8BA4\u6062\u590D",
  "restore.successTitle": "\u6062\u590D\u5B8C\u6210",
  "job.title.backup": "\u5907\u4EFD",
  "job.title.restore": "\u6062\u590D",
  "job.title.retry-plugins": "\u91CD\u8BD5\u63D2\u4EF6",
  "job.elapsed": "\u5DF2\u7528 {time}",
  "job.stage.backup.prepare": "\u51C6\u5907",
  "job.stage.backup.collect": "\u6536\u96C6\u6587\u4EF6",
  "job.stage.backup.copies": "\u6253\u5305\u63D2\u4EF6\u526F\u672C",
  "job.stage.backup.pack": "\u538B\u7F29",
  "job.stage.backup.encrypt": "\u52A0\u5BC6",
  "job.stage.backup.upload": "\u4E0A\u4F20/\u4FDD\u5B58",
  "job.stage.backup.done": "\u5B8C\u6210",
  "job.stage.backup.rollback": "\u521B\u5EFA\u56DE\u6EDA\u5FEB\u7167",
  "job.stage.backup.apply": "\u5199\u5165\u6587\u4EF6",
  "job.stage.backup.reinstall": "\u5B89\u88C5\u63D2\u4EF6",
  "job.stage.backup.verify": "\u6821\u9A8C",
  "job.stage.restore.prepare": "\u51C6\u5907",
  "job.stage.restore.rollback": "\u521B\u5EFA\u56DE\u6EDA\u5FEB\u7167",
  "job.stage.restore.apply": "\u5199\u5165\u6587\u4EF6",
  "job.stage.restore.reinstall": "\u5B89\u88C5\u63D2\u4EF6",
  "job.stage.restore.verify": "\u6821\u9A8C",
  "job.stage.restore.done": "\u5B8C\u6210",
  "job.stage.restore.collect": "\u6536\u96C6\u6587\u4EF6",
  "job.stage.restore.copies": "\u6253\u5305\u63D2\u4EF6\u526F\u672C",
  "job.stage.restore.pack": "\u538B\u7F29",
  "job.stage.restore.encrypt": "\u52A0\u5BC6",
  "job.stage.restore.upload": "\u4FDD\u5B58",
  "summary.restartDsh": "\u6062\u590D\u5DF2\u5168\u90E8\u5B8C\u6210\uFF0C\u8BF7\u91CD\u542F dsh\uFF08\u5B8C\u5168\u9000\u51FA Desktop \u540E\u91CD\u65B0\u6253\u5F00\uFF09\u4EE5\u52A0\u8F7D\u63D2\u4EF6\u548C\u914D\u7F6E\u3002",
  "summary.restartPartial": "\u6062\u590D\u5DF2\u7ED3\u675F\uFF0C\u6709 {count} \u4E2A\u63D2\u4EF6\u5B89\u88C5\u5931\u8D25\u3002\u8BF7\u91CD\u542F dsh\uFF08\u5B8C\u5168\u9000\u51FA Desktop \u540E\u91CD\u65B0\u6253\u5F00\uFF09\u4EE5\u52A0\u8F7D\u5DF2\u6062\u590D\u7684\u63D2\u4EF6\u548C\u914D\u7F6E\uFF1B\u5931\u8D25\u7684\u63D2\u4EF6\u53EF\u5728\u4E0B\u65B9\u91CD\u8BD5\u3002",
  "summary.restartFailedWritten": "\u6062\u590D\u672A\u5B8C\u6210\uFF0C\u4F46\u5DF2\u5199\u5165 {files} \u4E2A\u6587\u4EF6\u3002\u53EF\u4EE5\u7528\u4E0A\u9762\u7684\u56DE\u6EDA\u5FEB\u7167\u64A4\u9500\u8FD9\u4E9B\u53D8\u66F4\uFF1B\u5982\u679C\u4FDD\u7559\u5B83\u4EEC\uFF0C\u8BF7\u91CD\u542F dsh\uFF08\u5B8C\u5168\u9000\u51FA Desktop \u540E\u91CD\u65B0\u6253\u5F00\uFF09\u4F7F\u5176\u751F\u6548\u3002",
  "summary.restore.ok": "\u6062\u590D\u5B8C\u6210",
  "summary.restore.partial": "\u6062\u590D\u90E8\u5206\u5B8C\u6210",
  "summary.restore.failed": "\u6062\u590D\u5931\u8D25",
  "summary.restore.plugins": "\u63D2\u4EF6 {ok} \u6210\u529F \xB7 {failed} \u5931\u8D25",
  "summary.restore.pluginsOk": "\u63D2\u4EF6 {ok} \u6210\u529F",
  "summary.restore.pluginsSkipped": "\u63D2\u4EF6 {skipped} \u8DF3\u8FC7",
  "summary.restore.files": "\u6587\u4EF6 {applied} \u5199\u5165",
  "summary.restore.skipped": "{skipped} \u8DF3\u8FC7",
  "summary.took": "\u8017\u65F6 {time}",
  "summary.failedList": "\u5931\u8D25\u7684\u63D2\u4EF6\uFF08{count}\uFF09",
  "summary.restartDesktop": "\u91CD\u542F Desktop \u540E\u63D2\u4EF6\u624D\u4F1A\u52A0\u8F7D\uFF1B\u5728\u6B64\u4E4B\u524D\u63D2\u4EF6\u9875\u53EF\u80FD\u663E\u793A\u300C\u5305\u4E0D\u53EF\u7528\u300D\u3002",
  "summary.backup.ok": "\u5907\u4EFD\u5B8C\u6210",
  "summary.backup.files": "{files} \u4E2A\u6587\u4EF6",
  "summary.backup.copies": "\u63D2\u4EF6\u526F\u672C {copies} \u4E2A",
  "summary.backup.savedTo": "\u4FDD\u5B58\u5230 {location}",
  "restore.group.other": "\u5176\u4ED6",
  "restore.diffNoMatch": "\u6CA1\u6709\u5339\u914D\u7684\u6587\u4EF6\u3002",
  "restore.diffSearch": "\u7B5B\u9009\u8DEF\u5F84",
  "restore.showUnchanged": "\u663E\u793A\u76F8\u540C",
  "restore.expandAll": "\u5168\u90E8\u5C55\u5F00",
  "restore.collapseAll": "\u5168\u90E8\u6536\u8D77",
  "restore.showMore": "\u663E\u793A\u66F4\u591A\uFF08\u8FD8\u6709 {count} \u9879\uFF09",
  "restore.unchangedHidden": "\u5DF2\u9690\u85CF {count} \u4E2A\u76F8\u540C\u7684\u6587\u4EF6",
  "restore.diffOnlyUnchanged": "\u6CA1\u6709\u5DEE\u5F02\uFF1B{count} \u4E2A\u6587\u4EF6\u4E0E\u5F53\u524D\u76F8\u540C",
  "restore.diffGroupAllSame": "\u6B64\u5206\u7EC4\u7684\u6587\u4EF6\u90FD\u4E0E\u5F53\u524D\u76F8\u540C",
  "restore.successBody": "\u5DF2\u5E94\u7528 {applied} \u4E2A\u6587\u4EF6\uFF0C\u8DF3\u8FC7 {skipped} \u4E2A\u3002",
  "restore.partialBody": "\u914D\u7F6E\u5DF2\u5199\u5165\uFF08{applied} \u4E2A\u6587\u4EF6\uFF0C\u8DF3\u8FC7 {skipped}\uFF09\uFF0C\u4F46\u6709\u63D2\u4EF6\u672A\u88C5\u6210\u529F\uFF0C\u4E0D\u80FD\u7B97\u5B8C\u6574\u6062\u590D\u3002",
  "restore.rollbackCreated": "\u56DE\u6EDA\u5FEB\u7167\uFF1A{id}",
  "restore.pluginsReinstalled": "\u5DF2\u91CD\u88C5\uFF1A{list}",
  "restore.pluginsFailed": "\u5B89\u88C5\u5931\u8D25\uFF1A{list}",
  "restore.restartHint": "\u90E8\u5206\u53D8\u66F4\u53EF\u80FD\u9700\u8981\u91CD\u542F dsh \u540E\u751F\u6548\u3002",
  "restore.restartRequired": "\u8BF7\u91CD\u542F DeepSeek Harness Desktop\uFF08\u6216 dsh web\uFF09\u4EE5\u4F7F\u65B0\u88C5\u63D2\u4EF6\u751F\u6548\u3002",
  "restore.failedTitle": "\u6062\u590D\u5931\u8D25",
  "restore.resultTitle": "\u63D2\u4EF6\u5B89\u88C5\u7ED3\u679C",
  "restore.resultDesc": "{ok} \u4E2A\u5C31\u7EEA\uFF0C{failed} \u4E2A\u5931\u8D25",
  "restore.resultDescWithSkipped": "{ok} \u4E2A\u5C31\u7EEA\uFF0C{failed} \u4E2A\u5931\u8D25\uFF0C{skipped} \u4E2A\u8DF3\u8FC7",
  "restore.status.installed": "\u5DF2\u5B89\u88C5",
  "restore.status.installed-from-backup": "\u5DF2\u4ECE\u5907\u4EFD\u5B89\u88C5",
  "restore.status.already-present": "\u5DF2\u5C31\u7EEA",
  "restore.status.failed": "\u5931\u8D25",
  "restore.status.skipped": "\u5DF2\u8DF3\u8FC7",
  "restore.reason.foreign-local-source": "\u8BE5\u63D2\u4EF6\u4F7F\u7528\u7684\u662F\u53E6\u4E00\u64CD\u4F5C\u7CFB\u7EDF\u4E0A\u7684\u672C\u5730\u8DEF\u5F84 {subject}\uFF0C\u672C\u673A\u65E0\u6CD5\u8BBF\u95EE\uFF1B\u5907\u4EFD\u91CC\u4E5F\u6CA1\u6709\u4FDD\u5B58\u526F\u672C\u3002\u8BF7\u5728\u672C\u673A\u91CD\u65B0\u5B89\u88C5\uFF0C\u6216\u5728\u539F\u673A\u66F4\u65B0 dsh-vault \u540E\u91CD\u65B0\u5907\u4EFD",
  "restore.reason.local-source-missing": "\u672C\u5730\u63D2\u4EF6\u76EE\u5F55\u7F3A\u5931\uFF1A\u539F\u673A\u8DEF\u5F84 {subject}\uFF1B\u8BF7\u5728\u539F\u673A\u66F4\u65B0 dsh-vault \u540E\u91CD\u65B0\u5907\u4EFD",
  "restore.reason.tarball-missing": "\u672C\u5730\u5B89\u88C5\u5305\u7F3A\u5931\uFF1A\u539F\u673A\u8DEF\u5F84 {subject}\uFF1B\u8BF7\u5728\u539F\u673A\u66F4\u65B0 dsh-vault \u540E\u91CD\u65B0\u5907\u4EFD",
  "restore.reason.unsupported-spec": "\u4F9D\u8D56\u5199\u6CD5 {subject} \u53EA\u80FD\u5728\u539F\u673A\u7684\u5DE5\u4F5C\u533A\u4E2D\u89E3\u6790\uFF0C\u672C\u673A\u65E0\u6CD5\u5B89\u88C5",
  "restore.reason.blocked-by-other": "\u88AB\u5176\u4ED6\u63D2\u4EF6\u7684\u65E0\u6548\u4F9D\u8D56\u963B\u585E\uFF1A{subject}",
  "restore.reason.registry-not-found": "npm \u4ED3\u5E93\u4E2D\u627E\u4E0D\u5230 {subject}\uFF08\u6216\u65E0\u6743\u8BBF\u95EE\uFF09",
  "copies.title": "\u4FDD\u5B58\u63D2\u4EF6\u526F\u672C",
  "copies.desc": "\u628A\u5DF2\u5B89\u88C5\u7684\u63D2\u4EF6\u5305\u4E00\u8D77\u5199\u5165\u5FEB\u7167\u3002\u4ED3\u5E93\u91CC\u6CA1\u6709\u5BF9\u5E94\u7248\u672C\u6216\u672C\u5730\u63D2\u4EF6\u65F6\uFF0C\u6062\u590D\u4F1A\u7528\u8FD9\u4EFD\u526F\u672C\u5B89\u88C5\u3002",
  "copies.enable": "\u4FDD\u5B58\u63D2\u4EF6\u526F\u672C",
  "copies.enableDesc": "\u9ED8\u8BA4\u5168\u90E8\u4FDD\u5B58\u3002\u5173\u95ED\u540E\u5FEB\u7167\u66F4\u5C0F\uFF0C\u4F46\u672A\u53D1\u5E03\u7248\u672C\u548C\u672C\u5730\u63D2\u4EF6\u5728\u65B0\u673A\u5668\u4E0A\u53EF\u80FD\u88C5\u4E0D\u4E0A\u3002",
  "copies.order": "\u6062\u590D\u65F6",
  "copies.orderDesc": "\u4ED3\u5E93\u91CC\u627E\u4E0D\u5230\u8BE5\u7248\u672C\u7684\u63D2\u4EF6\u59CB\u7EC8\u76F4\u63A5\u4F7F\u7528\u526F\u672C\u3002",
  "copies.order.source-first": "\u4F18\u5148\u4ECE\u6E90\u5B89\u88C5\uFF0C\u5931\u8D25\u518D\u7528\u526F\u672C",
  "copies.order.copy-first": "\u4F18\u5148\u4F7F\u7528\u5907\u4EFD\u526F\u672C",
  "copies.loading": "\u6B63\u5728\u8BFB\u53D6\u63D2\u4EF6\u5217\u8868",
  "copies.checking": "\u6B63\u5728\u68C0\u67E5 npm \u4ED3\u5E93\u4E2D\u7684\u7248\u672C\u2026",
  "copies.none": "\u6CA1\u6709\u68C0\u6D4B\u5230\u63D2\u4EF6\u3002",
  "copies.recommended": "\u5EFA\u8BAE\u4FDD\u5B58\u526F\u672C",
  "copies.kind.npm": "npm",
  "copies.kind.github": "GitHub",
  "copies.kind.local": "\u672C\u5730",
  "copies.hint.local": "\u672C\u5730\u63D2\u4EF6\uFF1A\u65B0\u673A\u5668\u4E0A\u6CA1\u6709\u539F\u8DEF\u5F84\uFF0C\u53EA\u80FD\u7528\u526F\u672C\u5B89\u88C5\u3002",
  "copies.hint.missing": "npm \u4ED3\u5E93\u4E2D\u6CA1\u6709 {version} \u8FD9\u4E2A\u7248\u672C\u3002",
  "copies.hint.cordisOnly": "\u53EA\u5728 cordis.patch.yml / node_modules \u4E2D\uFF0C\u672A\u5199\u5165 package.json \u4F9D\u8D56\u3002",
  "restore.reason.not-resolvable": "{subject} \u5DF2\u5B89\u88C5\uFF0C\u4F46 dsh \u65E0\u6CD5\u4ECE\u914D\u7F6E\u6863\u6848\u76EE\u5F55\u89E3\u6790\u5B83\uFF08\u4F1A\u663E\u793A\u300C\u5305\u4E0D\u53EF\u7528\u300D\uFF09\uFF1B\u5DF2\u6682\u4E0D\u52A0\u8F7D\uFF0C\u8BF7\u70B9\u300C\u91CD\u8BD5\u5931\u8D25\u7684\u63D2\u4EF6\u300D\u540E\u91CD\u542F Desktop",
  "restore.reason.no-recorded-source": "\u5907\u4EFD\u4E2D\u6CA1\u6709\u8BB0\u5F55 {subject} \u7684\u5B89\u88C5\u6765\u6E90\uFF0C\u4E5F\u6CA1\u6709\u526F\u672C\uFF0C\u5DF2\u8DF3\u8FC7\uFF08\u907F\u514D\u4ECE npm \u88C5\u5230\u540C\u540D\u7684\u5176\u4ED6\u5305\uFF09",
  "restore.reason.integrity-mismatch": "npm \u4E0A\u7684 {subject} \u4E0E\u5907\u4EFD\u65F6\u5B89\u88C5\u7684\u4E0D\u662F\u540C\u4E00\u4E2A\u5305\uFF08\u6821\u9A8C\u503C\u4E0D\u540C\uFF09\uFF0C\u4E14\u5907\u4EFD\u91CC\u6CA1\u6709\u526F\u672C\uFF0C\u672A\u5B89\u88C5",
  "restore.reason.self": "\u5927\u80A5\u9C7C\u5907\u4EFD\u81EA\u8EAB\u4E0D\u4F1A\u88AB\u6062\u590D\u8986\u76D6\uFF0C\u4FDD\u7559\u672C\u673A\u5DF2\u5B89\u88C5\u7684\u7248\u672C",
  "restore.reason.source-not-approved": "\u8BE5\u63D2\u4EF6\u8981\u4ECE\u5FEB\u7167\u91CC\u8BB0\u5F55\u7684 git / \u538B\u7F29\u5305 / URL \u6E90\u4E0B\u8F7D\uFF0C\u4F60\u6CA1\u6709\u52FE\u9009\u5141\u8BB8\uFF0C\u4E14\u5FEB\u7167\u91CC\u6CA1\u6709\u526F\u672C\uFF0C\u5DF2\u8DF3\u8FC7",
  "restore.reason.invalid-spec": "\u5FEB\u7167\u91CC\u7684\u63D2\u4EF6\u8BB0\u5F55\u683C\u5F0F\u5F02\u5E38\uFF0C\u5DF2\u62D2\u7EDD\u5B89\u88C5",
  "restore.withSecrets": "\u6062\u590D\u51ED\u636E",
  "restore.withSecretsDesc": "\u6B64\u52A0\u5BC6\u5FEB\u7167\u5305\u542B API \u5BC6\u94A5\u7B49\u51ED\u636E\uFF1B\u5173\u95ED\u5219\u4FDD\u7559\u672C\u673A\u73B0\u6709\u51ED\u636E\u4E0D\u52A8\u3002",
  "restore.remoteSourcesTitle": "\u5141\u8BB8\u4ECE\u4EE5\u4E0B git / \u538B\u7F29\u5305 / URL \u6E90\u5B89\u88C5\u63D2\u4EF6",
  "restore.remoteSourcesHint": "\u8FD9\u4E9B\u6765\u6E90\u4F1A\u5728\u6062\u590D\u65F6\u88AB\u4E0B\u8F7D\u5E76\u5B89\u88C5\u3002\u53EA\u52FE\u9009\u4F60\u8BA4\u8BC6\u7684\u6765\u6E90\uFF1B\u4E0D\u52FE\u9009\u65F6\u82E5\u5FEB\u7167\u91CC\u6709\u526F\u672C\u5219\u7528\u526F\u672C\u5B89\u88C5\uFF0C\u5426\u5219\u8DF3\u8FC7\u3002",
  "restore.remoteSourcesImportHint": "\u5BFC\u5165\u7684\u6587\u4EF6\u6765\u6E90\u4E0D\u53EF\u4FE1\uFF0C\u9ED8\u8BA4\u5168\u90E8\u4E0D\u52FE\u9009\u3002\u53EA\u52FE\u9009\u4F60\u8BA4\u8BC6\u7684\u6765\u6E90\uFF1B\u4E0D\u52FE\u9009\u65F6\u82E5\u5FEB\u7167\u91CC\u6709\u526F\u672C\u5219\u7528\u526F\u672C\u5B89\u88C5\uFF0C\u5426\u5219\u8DF3\u8FC7\u3002",
  "restore.untrustedSource": "\u4E0D\u5728\u53EF\u4FE1\u6765\u6E90\uFF08npm \u5B98\u65B9\u6E90 / npmmirror\u3001github.com\uFF09\u4E4B\u5185\uFF0C\u9ED8\u8BA4\u4E0D\u52FE\u9009\uFF1B\u8BF7\u786E\u8BA4\u540E\u518D\u52FE\u9009\u3002",
  "restore.archiveLimit": "\u672C\u673A\u6700\u591A\u89E3\u538B {size} \u7684\u5FEB\u7167\u3002",
  "unfinished.title": "\u4E0A\u6B21\u6062\u590D\u6CA1\u6709\u5B8C\u6210",
  "unfinished.body": "\u6062\u590D\u5FEB\u7167 {snapshot}\uFF08\u5F00\u59CB\u4E8E {time}\uFF09\u65F6\u8FDB\u7A0B\u610F\u5916\u9000\u51FA\uFF0C\u6587\u4EF6\u53EF\u80FD\u53EA\u6062\u590D\u4E86\u4E00\u90E8\u5206\u3002\u5EFA\u8BAE\u4ECE\u6062\u590D\u524D\u7684\u56DE\u6EDA\u5FEB\u7167\u8FD8\u539F\u3002",
  "unfinished.bodyNoRollback": "\u6062\u590D\u5FEB\u7167 {snapshot}\uFF08\u5F00\u59CB\u4E8E {time}\uFF09\u65F6\u8FDB\u7A0B\u610F\u5916\u9000\u51FA\uFF0C\u6587\u4EF6\u53EF\u80FD\u53EA\u6062\u590D\u4E86\u4E00\u90E8\u5206\u3002\u90A3\u6B21\u6062\u590D\u6CA1\u6709\u521B\u5EFA\u56DE\u6EDA\u5FEB\u7167\uFF0C\u8BF7\u68C0\u67E5\u914D\u7F6E\u6216\u91CD\u65B0\u6062\u590D\u3002",
  "unfinished.encrypted": "\u56DE\u6EDA\u5FEB\u7167\u5DF2\u52A0\u5BC6\uFF0C\u9700\u8981\u8F93\u5165\u5F53\u65F6\u7684\u6062\u590D\u5BC6\u7801\u3002",
  "unfinished.rollback": "\u6253\u5F00\u56DE\u6EDA\u5FEB\u7167",
  "unfinished.dismiss": "\u5FFD\u7565",
  "restore.credentialsWritten": "\u5DF2\u5199\u5165\u51ED\u636E\u6587\u4EF6\uFF1A{files}",
  "restore.credentialsUntouched": "\u51ED\u636E\u6587\u4EF6\u672A\u88AB\u4FEE\u6539\u3002",
  "backup.overwriteConfirm": "\u5BFC\u51FA\u6587\u4EF6\u5DF2\u5B58\u5728\u3002\u8981\u8986\u76D6\u5B83\u5417\uFF1F",
  "restore.reason.no-backup-copy": "npm \u4ED3\u5E93\u4E2D\u627E\u4E0D\u5230 {subject}\uFF0C\u4E14\u8FD9\u4EFD\u5907\u4EFD\u91CC\u6CA1\u6709\u8BE5\u63D2\u4EF6\u7684\u526F\u672C\uFF0C\u8BF7\u7528\u65B0\u7248\u5927\u80A5\u9C7C\u5907\u4EFD\u91CD\u65B0\u5907\u4EFD",
  "restore.reason.network": "\u7F51\u7EDC\u9519\u8BEF\uFF0C\u65E0\u6CD5\u8FDE\u63A5 npm \u4ED3\u5E93\uFF1B\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5",
  "restore.reason.installer-missing": "\u672C\u673A\u627E\u4E0D\u5230 pnpm / dsh \u5B89\u88C5\u7A0B\u5E8F\uFF1B\u8BF7\u5728 DeepSeek Harness Desktop \u4E2D\u6267\u884C\u6062\u590D\uFF0C\u6216\u5728\u300C\u63D2\u4EF6\u300D\u9875\u5B89\u88C5",
  "restore.reason.missing-deps": "\u5DF2\u5B89\u88C5\u4F46\u7F3A\u5C11\u4F9D\u8D56\uFF1A{subject}",
  "restore.reason.version-mismatch": "\u7248\u672C\u4E0E\u5907\u4EFD\u4E0D\u4E00\u81F4\uFF1A{subject}",
  "restore.reason.incompatible": "\u63D2\u4EF6\u7248\u672C\u4E0E\u5F53\u524D dsh \u4E0D\u517C\u5BB9",
  "restore.reason.git-missing": "\u9700\u8981 git \u624D\u80FD\u4ECE GitHub \u5B89\u88C5 {subject}\uFF0C\u672C\u673A\u672A\u627E\u5230 git\uFF1B\u8BF7\u5B89\u88C5 Git for Windows \u540E\u70B9\u300C\u91CD\u8BD5\u5931\u8D25\u7684\u63D2\u4EF6\u300D",
  "restore.reason.git-unavailable": "\u65E0\u6CD5\u8BBF\u95EE Git \u4ED3\u5E93 {subject}\uFF08\u4ED3\u5E93\u5DF2\u5220\u9664/\u6539\u4E3A\u79C1\u6709\uFF0C\u6216\u7F51\u7EDC\u4E0D\u901A\uFF09",
  "restore.reason.unknown": "\u5B89\u88C5\u5931\u8D25\uFF1A{subject}",
  "restore.details": "\u8BE6\u60C5",
  "restore.legend.fromBackup": "\u300C\u5DF2\u4ECE\u5907\u4EFD\u5B89\u88C5\u300D\uFF1Anpm/GitHub \u4E0A\u5DF2\u627E\u4E0D\u5230\u8BE5\u7CBE\u786E\u7248\u672C\uFF0C\u6539\u7528\u5907\u4EFD\u91CC\u6253\u5305\u7684\u63D2\u4EF6\u526F\u672C\u3002",
  "restore.ok.linkedBundled": "\u5DF2\u94FE\u63A5\u5907\u4EFD\u4E2D\u7684\u63D2\u4EF6\u6E90\u7801",
  "restore.ok.bundledTarball": "\u5DF2\u4ECE\u5907\u4EFD\u4E2D\u7684\u5B89\u88C5\u5305\u5B89\u88C5",
  "restore.ok.fromBackup": "\u6CE8\u518C\u8868\u5DF2\u65E0\u6B64\u7248\u672C\uFF0C\u5DF2\u7528\u5907\u4EFD\u4E2D\u7684\u526F\u672C\u5B89\u88C5{version}",
  "restore.ok.linkedLocal": "\u5DF2\u94FE\u63A5\u672C\u673A\u6E90\u7801\uFF1A{subject}",
  "restore.ok.installed": "\u5B89\u88C5\u6210\u529F{version}",
  "restore.ok.present": "\u672C\u673A\u5DF2\u5B89\u88C5{version}",
  "restore.retryFailed": "\u91CD\u8BD5\u5931\u8D25\u7684\u63D2\u4EF6",
  "restore.retrying": "\u6B63\u5728\u91CD\u8BD5\u2026",
  "restore.retryDesc": "\u4FEE\u590D\u539F\u56E0\u540E\uFF0C\u53EA\u91CD\u65B0\u5B89\u88C5\u5931\u8D25\u7684\u63D2\u4EF6\uFF0C\u4E0D\u4F1A\u6539\u5199\u914D\u7F6E\u3002",
  "notice.reenterSecrets": "\u8BF7\u5728\u300C\u8BBE\u7F6E \u2192 \u6A21\u578B\u300D\u4E2D\u91CD\u65B0\u586B\u5199 API Key \u7B49\u51ED\u636E\uFF08\u6B64\u5FEB\u7167\u672A\u5305\u542B\u51ED\u636E\uFF09\u3002",
  "notice.localSources": "\u90E8\u5206\u63D2\u4EF6\u4F7F\u7528\u672C\u5730 link:/file: \u6765\u6E90\uFF0C\u8BF7\u5728\u672C\u673A\u91CD\u65B0\u5B89\u88C5\u6216\u91CD\u65B0\u94FE\u63A5\u3002",
  "notice.restartDesktop": "\u8BF7\u91CD\u542F DeepSeek Harness Desktop \u4EE5\u52A0\u8F7D\u65B0\u5B89\u88C5\u7684\u63D2\u4EF6\u3002",
  "notice.restartWeb": "\u8BF7\u91CD\u542F dsh web\uFF08\u6216\u5BBF\u4E3B\uFF09\u4EE5\u52A0\u8F7D\u65B0\u5B89\u88C5\u7684\u63D2\u4EF6\u3002",
  "notice.crossPlatformLocalSources": "\u5FEB\u7167\u6765\u81EA\u53E6\u4E00\u64CD\u4F5C\u7CFB\u7EDF\uFF1B\u672C\u673A\u65E0\u6CD5\u4F7F\u7528\u5176\u4E2D\u7684\u672C\u5730\u63D2\u4EF6\u8DEF\u5F84\uFF0C\u672A\u4FDD\u5B58\u526F\u672C\u7684\u63D2\u4EF6\u4F1A\u5355\u72EC\u5217\u51FA\u5E76\u8DF3\u8FC7\uFF0C\u5176\u4ED6\u63D2\u4EF6\u548C\u914D\u7F6E\u7EE7\u7EED\u6062\u590D\u3002",
  "notice.removedForeignDeps": "\u5DF2\u4ECE\u914D\u7F6E\u6863\u6848\u4E2D\u79FB\u9664\u6307\u5411\u53E6\u4E00\u53F0\u7535\u8111\u672C\u5730\u6587\u4EF6\u7684\u63D2\u4EF6\u6761\u76EE\uFF1B\u672C\u673A\u82E5\u8981\u7EE7\u7EED\u4F7F\u7528\uFF0C\u8BF7\u91CD\u65B0\u5B89\u88C5\u8FD9\u4E9B\u63D2\u4EF6\u3002",
  "notice.partialRestore": "\u6062\u590D\u672A\u5B8C\u5168\u6210\u529F\uFF1A\u6709\u63D2\u4EF6\u5B89\u88C5\u5931\u8D25\u3002\u4FEE\u590D\u539F\u56E0\u540E\u70B9\u300C\u91CD\u8BD5\u5931\u8D25\u7684\u63D2\u4EF6\u300D\uFF0C\u6216\u5728 Desktop \u2192\u300C\u63D2\u4EF6\u300D\u9875\u5B89\u88C5\u3002",
  "notice.launchDesktopOnce": "\u5148\u542F\u52A8\u4E00\u6B21 DeepSeek Harness Desktop \u4EE5\u521B\u5EFA $DSH_HOME/profiles/desktop\uFF0C\u7136\u540E\u5B8C\u5168\u9000\u51FA\u3002",
  "notice.useBundledDsh": "\u4F7F\u7528 Desktop \u81EA\u5E26\u7684 dsh\uFF08\u6258\u76D8 \u2192 \u7EC8\u7AEF\uFF0C\u6216\u5E94\u7528\u65C1\u7684 dsh / dsh.cmd\uFF09\u6267\u884C\u547D\u4EE4\uFF1Bnpm \u5168\u5C40\u5B89\u88C5\u7684 dsh \u4E0D\u80FD\u7BA1\u7406 desktop \u914D\u7F6E\u6863\u6848\u3002",
  "notice.installFromPlugins": "\u6216\u5728 Desktop \u8FD0\u884C\u65F6\u4ECE\u300C\u63D2\u4EF6\u300D\u9875\u5B89\u88C5\uFF08\u540C\u4E00\u63D2\u4EF6\u7BA1\u7406\u5668\uFF09\u3002",
  "notice.reopenDesktop": "\u5B89\u88C5\u540E\u91CD\u65B0\u6253\u5F00 Desktop \u4EE5\u52A0\u8F7D\u63D2\u4EF6\u3002",
  // storage
  "storage.desc": "\u5FEB\u7167\u5199\u5165\u7684\u4F4D\u7F6E\uFF1A\u672C\u5730\u76EE\u5F55\u3001GitHub\u3001WebDAV \u6216 S3 \u517C\u5BB9\u5B58\u50A8\u3002",
  "storage.emptyTitle": "\u8FD8\u6CA1\u6709\u5B58\u50A8\u4F4D\u7F6E",
  "storage.emptyBody": "\u6DFB\u52A0\u672C\u5730\u76EE\u5F55\u540E\u5373\u53EF\u5F00\u59CB\u5907\u4EFD\u3002",
  "storage.targetsLabel": "\u5DF2\u914D\u7F6E\u7684\u5B58\u50A8\u4F4D\u7F6E",
  "storage.snapshots": "{count} \u4E2A\u5FEB\u7167",
  "storage.lastBackup": "\u4E0A\u6B21 {time}",
  "storage.noSnapshots": "\u5C1A\u672A\u5907\u4EFD",
  "storage.storedCredentials": "\u5DF2\u4FDD\u5B58\u51ED\u636E",
  "storage.test": "\u6D4B\u8BD5\u8FDE\u63A5",
  "storage.testing": "\u6B63\u5728\u6D4B\u8BD5\u2026",
  "storage.testOk": "\u8FDE\u63A5\u6B63\u5E38\uFF0C{count} \u4E2A\u5FEB\u7167",
  "storage.testFail": "\u8FDE\u63A5\u5931\u8D25\uFF1A{error}",
  "storage.edit": "\u7F16\u8F91",
  "storage.delete": "\u5220\u9664",
  "storage.deleteTitle": "\u5220\u9664\u5B58\u50A8\u4F4D\u7F6E\u300C{label}\u300D\uFF1F",
  "storage.deleteBody": "\u53EA\u5220\u9664\u914D\u7F6E\uFF0C\u5DF2\u4E0A\u4F20\u7684\u5FEB\u7167\u6587\u4EF6\u4E0D\u4F1A\u88AB\u5220\u9664\u3002",
  "storage.deleteConfirm": "\u5220\u9664",
  "storage.addTitle": "\u6DFB\u52A0\u5B58\u50A8\u4F4D\u7F6E",
  "storage.addDesc": "\u9009\u62E9\u7C7B\u578B\u5E76\u586B\u5199\u8FDE\u63A5\u4FE1\u606F\u3002",
  "storage.editTitle": "\u7F16\u8F91\u5B58\u50A8\u4F4D\u7F6E",
  "storage.kind": "\u7C7B\u578B",
  "storage.kind.local": "\u672C\u5730\u76EE\u5F55",
  "storage.kind.github": "GitHub \u4ED3\u5E93",
  "storage.kind.webdav": "WebDAV",
  "storage.kind.s3": "S3 \u517C\u5BB9\u5B58\u50A8",
  "storage.id": "ID",
  "storage.idHint": "\u552F\u4E00\u6807\u8BC6\uFF0C\u4F8B\u5982 nas\u3001r2",
  "storage.label": "\u540D\u79F0",
  "storage.directory": "\u76EE\u5F55",
  "storage.directoryHint": "\u652F\u6301 ~ \u8DEF\u5F84",
  "storage.owner": "\u6240\u6709\u8005",
  "storage.repo": "\u4ED3\u5E93",
  "storage.branch": "\u5206\u652F",
  "storage.pathPrefix": "\u8DEF\u5F84\u524D\u7F00",
  "storage.tokenCredential": "\u51ED\u636E\u5F15\u7528",
  "storage.token": "\u8BBF\u95EE\u4EE4\u724C",
  "storage.tokenHint": "\u7559\u7A7A\u5219\u4F7F\u7528\u51ED\u636E\u5F15\u7528",
  "storage.url": "\u5730\u5740",
  "storage.username": "\u7528\u6237\u540D",
  "storage.password": "\u5BC6\u7801",
  "storage.passwordKeep": "\u7559\u7A7A\u4FDD\u7559\u5DF2\u4FDD\u5B58\u7684\u5BC6\u7801",
  "storage.endpoint": "Endpoint",
  "storage.region": "\u533A\u57DF",
  "storage.bucket": "\u5B58\u50A8\u6876",
  "storage.accessKey": "Access Key",
  "storage.secretKey": "Secret Key",
  "storage.secretKeep": "\u7559\u7A7A\u4FDD\u7559\u5DF2\u4FDD\u5B58\u7684\u5BC6\u94A5",
  "storage.forcePathStyle": "Path-style URL",
  "storage.forcePathStyleDesc": "MinIO\u3001R2 \u7B49\u517C\u5BB9\u670D\u52A1\u9700\u8981\u5F00\u542F\u3002",
  "storage.encDefault": "\u9ED8\u8BA4\u52A0\u5BC6",
  "storage.encDefaultDesc": "\u6B64\u4F4D\u7F6E\u7684\u5FEB\u7167\u9ED8\u8BA4\u52A0\u5BC6\u3002",
  "storage.missing": "\u8BF7\u586B\u5199\uFF1A{fields}",
  "storage.idExists": "\u8BE5 ID \u5DF2\u5B58\u5728\uFF0C\u4FDD\u5B58\u5C06\u8986\u76D6\u3002",
  "storage.saveNew": "\u4FDD\u5B58",
  "storage.saveEdit": "\u4FDD\u5B58",
  "storage.saved": "\u5DF2\u4FDD\u5B58\u300C{label}\u300D",
  "storage.deleted": "\u5DF2\u5220\u9664\u300C{label}\u300D",
  "storage.cancel": "\u53D6\u6D88",
  "storage.snapshotsCount": "{count}",
  "storage.addKind": "\u6DFB\u52A0 {kind}",
  // snapshots
  "snapshots.desc": "\u67E5\u770B\u3001\u6821\u9A8C\u548C\u5220\u9664\u6240\u6709\u5B58\u50A8\u4F4D\u7F6E\u4E0A\u7684\u5FEB\u7167\u3002",
  "snapshots.search": "\u641C\u7D22\u5FEB\u7167 ID \u6216\u5907\u6CE8",
  "snapshots.filterTarget": "\u5B58\u50A8\u4F4D\u7F6E",
  "snapshots.filterMode": "\u52A0\u5BC6\u6A21\u5F0F",
  "snapshots.mode.all": "\u5168\u90E8",
  "snapshots.mode.encrypted": "\u52A0\u5BC6",
  "snapshots.mode.plaintext": "\u660E\u6587",
  "snapshots.mode.secrets": "\u542B\u51ED\u636E",
  "snapshots.count": "{shown} / {total}",
  "snapshots.emptyTitle": "\u6682\u65E0\u5FEB\u7167",
  "snapshots.emptyBody": "\u521B\u5EFA\u7B2C\u4E00\u4E2A\u5907\u4EFD\u540E\uFF0C\u5FEB\u7167\u4F1A\u663E\u793A\u5728\u8FD9\u91CC\u3002",
  "snapshots.noMatch": "\u6CA1\u6709\u5339\u914D\u7684\u5FEB\u7167\u3002",
  "snapshots.clear": "\u6E05\u9664\u7B5B\u9009",
  "snapshots.verify": "\u6821\u9A8C",
  "snapshots.verified": "\u5DF2\u6821\u9A8C",
  "snapshots.verifyOk": "\u6821\u9A8C\u901A\u8FC7",
  "snapshots.verifyFail": "\u6821\u9A8C\u5931\u8D25\uFF1A{error}",
  "snapshots.verifyPassword": "\u89E3\u5BC6\u5BC6\u7801",
  "snapshots.verifyPasswordHint": "\u8BE5\u5FEB\u7167\u5DF2\u52A0\u5BC6\uFF0C\u6821\u9A8C\u9700\u8981\u5BC6\u7801\u3002",
  "snapshots.verifying": "\u6B63\u5728\u6821\u9A8C\u2026",
  "snapshots.restoreAction": "\u6062\u590D",
  "snapshots.deleteTitle": "\u5220\u9664\u5FEB\u7167 {id}\uFF1F",
  "snapshots.deleteBody": "\u5C06\u4ECE\u300C{target}\u300D\u6C38\u4E45\u5220\u9664\uFF0C\u65E0\u6CD5\u64A4\u9500\u3002",
  "snapshots.deleteConfirm": "\u6C38\u4E45\u5220\u9664",
  "snapshots.deleted": "\u5DF2\u5220\u9664\u5FEB\u7167 {id}",
  "snapshots.truncated": "\u4EC5\u663E\u793A\u524D {shown} \u4E2A\u5FEB\u7167\u3002",
  "snapshots.goBackup": "\u524D\u5F80\u5907\u4EFD",
  // auto backup / schedule
  "schedule.desc": "\u5728 dsh \u8FD0\u884C\u671F\u95F4\u6309\u95F4\u9694\u81EA\u52A8\u521B\u5EFA\u5FEB\u7167\u3002",
  "schedule.enabled": "\u5F00\u542F\u81EA\u52A8\u5907\u4EFD",
  "schedule.enabledDesc": "\u5BBF\u4E3B\u63D2\u4EF6\u52A0\u8F7D\u65F6\u751F\u6548\u3002",
  "schedule.interval": "\u95F4\u9694",
  "schedule.interval.desc": "\u4E0B\u6B21\u8FD0\u884C\uFF1A{next}",
  "schedule.lastRun": "\u4E0A\u6B21\u8FD0\u884C",
  "schedule.target": "\u5907\u4EFD\u5230",
  "schedule.targetMissing": "\u6240\u9009\u5B58\u50A8\u4F4D\u7F6E\u4E0D\u5B58\u5728\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002",
  "schedule.encrypt": "\u52A0\u5BC6",
  "schedule.encryptDesc": "\u81EA\u52A8\u5907\u4EFD\u65E0\u6CD5\u8F93\u5165\u5BC6\u7801\uFF1B\u76EE\u6807\u9ED8\u8BA4\u52A0\u5BC6\u65F6\u7531\u76EE\u6807\u8BBE\u7F6E\u51B3\u5B9A\u3002",
  "schedule.secrets": "\u5305\u542B\u51ED\u636E",
  "schedule.secretsDescEncrypted": "\u51ED\u636E\u53EA\u5B58\u5728\u4E8E\u52A0\u5BC6\u8D1F\u8F7D\u4E2D\u3002",
  "schedule.secretsDescHalted": "\u9700\u8981\u5148\u5F00\u542F\u52A0\u5BC6\u3002",
  "schedule.runNow": "\u7ACB\u5373\u8FD0\u884C",
  "schedule.runNowDesc": "\u624B\u52A8\u6267\u884C\u4E00\u6B21\u81EA\u52A8\u5907\u4EFD\u3002",
  "schedule.runDisabled": "\u5F00\u542F\u81EA\u52A8\u5907\u4EFD\u540E\u53EF\u624B\u52A8\u8FD0\u884C\u3002",
  "schedule.save": "\u4FDD\u5B58",
  "schedule.saving": "\u6B63\u5728\u4FDD\u5B58\u2026",
  "schedule.saved": "\u5DF2\u4FDD\u5B58",
  "schedule.dirty": "\u6709\u672A\u4FDD\u5B58\u7684\u4FEE\u6539",
  "schedule.discard": "\u64A4\u9500",
  "schedule.intervalLabel": "\u5E38\u7528\u95F4\u9694",
  "schedule.custom": "\u81EA\u5B9A\u4E49",
  "schedule.customUnit": "\u5206\u949F",
  "schedule.intervalMin": "\u81F3\u5C11 15 \u5206\u949F\u3002",
  "schedule.interval.every15": "\u6BCF 15 \u5206\u949F",
  "schedule.interval.every30": "\u6BCF 30 \u5206\u949F",
  "schedule.interval.every60": "\u6BCF\u5C0F\u65F6",
  "schedule.interval.every360": "\u6BCF 6 \u5C0F\u65F6",
  "schedule.interval.every720": "\u6BCF 12 \u5C0F\u65F6",
  "schedule.interval.every1440": "\u6BCF\u5929",
  "schedule.interval.every10080": "\u6BCF\u5468",
  "schedule.retentionTitle": "\u4FDD\u7559\u7B56\u7565",
  "schedule.retentionDesc": "\u6BCF\u6B21\u5907\u4EFD\u540E\u81EA\u52A8\u6E05\u7406\u8D85\u51FA\u6570\u91CF\u7684\u65E7\u5FEB\u7167\u3002",
  "schedule.keepLast": "\u6BCF\u4E2A\u5B58\u50A8\u4F4D\u7F6E\u4FDD\u7559",
  "schedule.keepLastUnit": "\u4E2A\u5FEB\u7167",
  "schedule.keepLastHint": "\u8303\u56F4 1\u2013200\u3002",
  "schedule.defaultsTitle": "\u9ED8\u8BA4\u503C",
  "schedule.defaultTarget": "\u9ED8\u8BA4\u5B58\u50A8\u4F4D\u7F6E",
  "schedule.defaultTargetDesc": "\u5907\u4EFD\u9875\u9ED8\u8BA4\u9009\u4E2D\u3002",
  "schedule.kdf": "\u5BC6\u94A5\u6D3E\u751F",
  "schedule.kdfDesc": "argon2id \u9700\u8981\u5BBF\u4E3B\u63D0\u4F9B\u5B9E\u73B0\u3002",
  "schedule.kdf.scrypt": "scrypt",
  "schedule.kdf.argon2id": "argon2id",
  "schedule.language": "\u8BED\u8A00",
  "schedule.languageDesc": "\u8DDF\u968F dsh \u7684\u754C\u9762\u8BED\u8A00\uFF1B\u9ED8\u8BA4\u7B80\u4F53\u4E2D\u6587\u3002",
  "schedule.lang.auto": "\u8DDF\u968F dsh",
  "schedule.lang.zh": "\u7B80\u4F53\u4E2D\u6587",
  "schedule.lang.en": "English",
  "schedule.runDone": "\u81EA\u52A8\u5907\u4EFD\u5B8C\u6210\uFF1A{id}",
  "schedule.runSkipped": "\u81EA\u52A8\u5907\u4EFD\u672A\u5F00\u542F\u3002",
  "schedule.loading": "\u6B63\u5728\u52A0\u8F7D\u8BBE\u7F6E\u2026",
  // relative time
  "time.justNow": "\u521A\u521A",
  "time.minutesAgo": "{n} \u5206\u949F\u524D",
  "time.hoursAgo": "{n} \u5C0F\u65F6\u524D",
  "time.daysAgo": "{n} \u5929\u524D",
  "time.inMinutes": "{n} \u5206\u949F\u540E",
  "time.inHours": "{n} \u5C0F\u65F6\u540E",
  "time.inDays": "{n} \u5929\u540E"
};
var en = {
  "section.label": "\u5927\u80A5\u9C7C\u5907\u4EFD",
  "section.title": "\u5927\u80A5\u9C7C\u5907\u4EFD",
  "section.description": "Back up and restore dsh plugins, MCP servers, skills, settings and profiles.",
  "section.tabs": "\u5927\u80A5\u9C7C\u5907\u4EFD sections",
  "section.tab.overview": "Overview",
  "section.tab.backup": "Backup",
  "section.tab.restore": "Restore",
  "section.tab.storage": "Storage",
  "section.tab.snapshots": "Snapshots",
  "section.tab.schedule": "Auto backup",
  "app.showPassword": "Show password",
  "app.hidePassword": "Hide password",
  "app.cancel": "Cancel",
  "app.retry": "Retry",
  "app.loading": "Loading\u2026",
  "app.error": "Could not load",
  "app.refresh": "Refresh",
  "common.never": "Never",
  "common.none": "None",
  "common.on": "On",
  "common.off": "Off",
  "common.optional": " (optional)",
  "common.encrypted": "Encrypted",
  "common.plaintext": "Plaintext",
  "error.path.private": "This is dsh-vault's private data folder and cannot be browsed or chosen: {path}",
  "error.path.credentials": "Credential folders (such as .ssh, .aws) cannot be browsed or chosen: {path}",
  "error.path.system": "System folders cannot be chosen: {path}",
  "error.path.outside": "Choose a folder in your home, on another / removable drive, or one picked in the system dialog: {path}",
  "error.path.notArchive": "Only .tar.gz / .dshvault snapshot files or snapshot folders can be imported: {path}",
  "error.path.relative": "Enter a full path: {path}",
  "error.badSnapshot": "Not a valid dsh-vault snapshot (damaged, or not a snapshot archive)",
  "error.noSnapshotInFolder": "No snapshot in this folder: expected .tar.gz / .dshvault files, or an extracted snapshot (manifest.json and files/)",
  "common.secrets": "With secrets",
  "common.verify": "Verify",
  "common.delete": "Delete",
  "common.default": "Default",
  "common.allTargets": "All storage locations",
  "restore.rollbackTarget": "Rollback snapshots (taken before restores)",
  "common.target": "Storage location",
  "common.snapshot": "Snapshot",
  "common.size": "Size",
  "common.createdAt": "Created",
  "common.notes": "Notes",
  "common.save": "Save",
  "kind.local": "Local folder",
  "kind.github": "GitHub",
  "kind.webdav": "WebDAV",
  "kind.s3": "S3 compatible",
  "kind.localPlain": "Local plaintext",
  "kind.localEnc": "Local encrypted",
  "overview.desc": "Current backup status.",
  "overview.lastTitle": "Last backup",
  "overview.lastEmpty": "No snapshots yet",
  "overview.lastValue": "{target} \xB7 {time}",
  "overview.snapshotsTitle": "Snapshots",
  "overview.snapshotsValue": "{count} \xB7 {size}",
  "overview.snapshotsEmpty": "No snapshots",
  "overview.snapshotsDesc": "{encrypted} encrypted, {plain} plaintext",
  "overview.noTargets": "No storage locations yet",
  "overview.scheduleTitle": "Auto backup",
  "overview.scheduleOff": "Off",
  "overview.scheduleValue": "{interval}, next {time}",
  "overview.scheduleNoNext": "{interval}, waiting for next run",
  "overview.backupRow": "Back up now",
  "overview.backupButton": "Back up",
  "overview.backupDesc": "Creates a snapshot with the settings on the Backup tab.",
  "overview.backupDescTarget": "Backs up to \u201C{target}\u201D.",
  "overview.targetsTitle": "Storage locations",
  "overview.securityTitle": "Credentials",
  "overview.secretsNote": "Credential files are excluded by default; only encrypted snapshots with a password include them.",
  "overview.emptyTitle": "No storage locations yet",
  "overview.emptyBody": "Add a local folder or cloud storage under Storage first.",
  "overview.goStorage": "Add storage location",
  "backup.desc": "Choose scope, storage location and encryption, then create a snapshot.",
  "backup.noTargetsTitle": "No storage locations yet",
  "backup.noTargetsBody": "Add a storage location before creating snapshots.",
  "backup.goStorage": "Open Storage",
  "backup.targetTitle": "Storage location",
  "backup.targetDesc": "Where the snapshot is written.",
  "backup.targetEncBadge": "Encrypts by default",
  "backup.destMode": "Destination",
  "backup.destModeDesc": "A configured target, any local folder, or a single portable archive file.",
  "backup.dest.target": "Configured storage location",
  "backup.dest.directory": "Any local folder",
  "backup.dest.file": "Export to file",
  "backup.directory": "Folder path",
  "backup.directoryHint": "Drive letters (e.g. D:\\Backups), USB, or synced folders work. On Windows cmd use a full path, not ~.",
  "backup.directoryPlaceholder": "e.g. C:\\Users\\you\\Backups or /Volumes/USB/dsh",
  "backup.exportFile": "Export file path",
  "backup.exportFileHint": "A single .tar.gz (plain) or .dshvault (encrypted) archive you can copy to another machine.",
  "backup.exportFilePlaceholder": "e.g. D:\\dsh-backup.dshvault",
  "backup.browse": "Browse\u2026",
  "backup.scopeTitle": "Scope",
  "backup.scopeDesc": "Selected categories are written to the snapshot.",
  "backup.scopeSummary": "{selected}/{total} selected",
  "backup.scopeAll": "Select all",
  "backup.scopeNone": "Clear",
  "backup.cat.plugins": "Plugins",
  "backup.cat.plugins.desc": "Plugin dependencies and cordis patches",
  "backup.cat.plugin-config": "Plugin config",
  "backup.cat.plugin-config.desc": "Plugin data and profile folders",
  "backup.cat.mcp": "MCP",
  "backup.cat.mcp.desc": "mcp.json and MCP servers",
  "backup.cat.skills": "Skills",
  "backup.cat.skills.desc": "Skills from dsh and agents home",
  "backup.cat.settings": "Settings",
  "backup.cat.settings.desc": "settings.yaml",
  "backup.cat.providers": "Model providers",
  "backup.cat.providers.desc": "Provider and API configuration",
  "backup.cat.agent-presets": "Agent presets",
  "backup.cat.agent-presets.desc": "Agent preset folders",
  "backup.cat.profiles": "Profiles",
  "backup.cat.profiles.desc": "profiles/** (no node_modules)",
  "backup.cat.instructions": "Instructions",
  "backup.cat.instructions.desc": "AGENTS.md",
  "backup.cat.plugin-data": "Plugin data (per-plugin folders in .dsh)",
  "backup.cat.plugin-data.desc": "Each plugin's own folders and files under $DSH_HOME (no sessions, attachments, node_modules or caches)",
  "backup.cat.plugin-data.found": "Detected: {list}",
  "backup.cat.plugin-data.none": "No plugin data folders detected",
  "backup.cat.credentials": "Credentials",
  "backup.cat.credentials.desc": ".credentials.yaml (encrypted only)",
  "backup.cat.credentials.plainBlocked": "Only an encrypted backup can include credentials. Turn on encryption below to choose this.",
  "backup.encTitle": "Encryption",
  "backup.encDesc": "scrypt + AES-256-GCM. Recommended for cloud or shared storage.",
  "backup.password": "Password",
  "backup.passwordPlaceholder": "Enter a password",
  "backup.passwordHint": "Not stored; needed again to restore.",
  "backup.passwordRequired": "Encrypted snapshots need a password.",
  "backup.strength": "Strength: {level}",
  "backup.strength.0": "empty",
  "backup.strength.1": "weak",
  "backup.strength.2": "fair",
  "backup.strength.3": "good",
  "backup.strength.4": "strong",
  "backup.secretsTitle": "Include credential files",
  "backup.secretsDesc": "Encrypted snapshots only; secrets stay inside the encrypted payload.",
  "backup.secretsBlocked": "Enable encryption first.",
  "backup.notes": "Notes",
  "backup.notesPlaceholder": "Optional, e.g. \u201Cbefore upgrade\u201D",
  "backup.submit": "Create snapshot",
  "backup.submitting": "Backing up\u2026",
  "backup.progress": "Creating snapshot",
  "backup.progressStage": "Creating snapshot ({stage})",
  "backup.progress.collect": "Collecting files",
  "backup.progress.pack": "Packing",
  "backup.progress.encrypt": "Encrypting",
  "backup.progress.upload": "Uploading",
  "backup.successTitle": "Created snapshot {id}",
  "backup.failedTitle": "Backup failed",
  "backup.noScope": "Select at least one category.",
  "backup.done": "Done",
  "restore.desc": "Preview the diff and resolve conflicts item by item before restoring. Import from a configured target or any folder / archive file.",
  "restore.sourceTitle": "Restore source",
  "restore.sourceDesc": "A configured snapshot, or a folder / archive copied from another machine.",
  "restore.sourceMode": "Source",
  "restore.sourceModeDesc": "No need to create a storage target first when importing from a path.",
  "restore.source.target": "Configured storage location",
  "restore.source.import": "Import from folder or file",
  "restore.importPath": "Import path",
  "restore.importPathHint": "A snapshot folder, or a single .tar.gz / .dshvault file. Windows drive letters and spaces are fine.",
  "restore.importPathPlaceholder": "e.g. D:\\from-machine1\\snap or C:\\Users\\you\\export.dshvault",
  "restore.importPasswordHint": "Required if the archive is encrypted; leave blank for plaintext.",
  "restore.browse": "Browse\u2026",
  "picker.title.directory": "Choose folder",
  "picker.title.open": "Choose backup file or snapshot folder",
  "picker.title.save": "Choose export location",
  "picker.roots": "Drive",
  "picker.home": "Home",
  "picker.up": "Up",
  "picker.newFolder": "New folder",
  "picker.newFolderName": "Folder name",
  "picker.create": "Create",
  "picker.path": "Current path",
  "picker.go": "Go",
  "picker.loading": "Loading\u2026",
  "picker.empty": "This folder is empty",
  "picker.showHidden": "Show hidden items",
  "picker.archiveOnly": "Showing folders and .tar.gz / .dshvault archives",
  "picker.fileName": "File name",
  "picker.selectFolder": "Use this folder",
  "picker.selectFile": "Select file",
  "picker.saveHere": "Save here",
  "picker.native": "System dialog\u2026",
  "picker.nativeFailed": "System dialog unavailable: {error}",
  "restore.snapshotTitle": "Snapshot",
  "restore.snapshotDesc": "{count} available, newest first.",
  "restore.select": "Snapshot to restore",
  "restore.filterTarget": "Filter by storage location",
  "restore.search": "Search snapshot ID or notes",
  "restore.password": "Password",
  "restore.passwordHint": "This snapshot is encrypted.",
  "restore.passwordRequired": "Enter the password before previewing.",
  "restore.preview": "Preview diff",
  "restore.previewing": "Analyzing diff\u2026",
  "restore.emptyTitle": "No snapshots to restore",
  "restore.emptyBody": "Create a snapshot on the Backup tab first.",
  "restore.noMatch": "No matching snapshots.",
  "restore.noTargetsTitle": "No storage locations yet",
  "restore.noTargetsBody": "Add a storage location first.",
  "restore.diffTitle": "Changes",
  "restore.diffDesc": "Added {added} \xB7 Changed {changed} \xB7 Removed {removed} \xB7 Unchanged {unchanged}",
  "restore.filter.all": "All",
  "restore.filter.add": "Added",
  "restore.filter.change": "Changed",
  "restore.filter.remove": "Removed",
  "restore.filter.unchanged": "Unchanged",
  "restore.added": "Added",
  "restore.changed": "Changed",
  "restore.removed": "Removed",
  "restore.unchanged": "Unchanged",
  "restore.path": "Path",
  "restore.category": "Category",
  "restore.change": "Change",
  "restore.resolution": "Result",
  "restore.diffEmpty": "Nothing to apply \u2014 the current setup matches this snapshot.",
  "restore.truncated": "Showing the first {shown} items.",
  "restore.removedNote": "\u201CRemoved\u201D items are reported only; local files are not deleted.",
  "restore.conflictTitle": "Conflicts",
  "restore.conflictDesc": "Choose per item whether to take the backup or keep the current file.",
  "restore.conflictsSummary": "{use} use backup, {keep} keep current",
  "restore.bulk": "Set all",
  "restore.useBackup": "Use backup",
  "restore.perItem": "Handling for {path}",
  "restore.keepCurrent": "Keep current",
  "restore.willApply": "Will write",
  "restore.willSkip": "Will skip",
  "restore.noChange": "No change",
  "restore.crossPlatformTitle": "Snapshot from another operating system",
  "restore.crossPlatformDesc": "The snapshot was made on {source}; this machine runs {target}. Configuration and other plugins still restore, but local plugin paths from the source system are unavailable here.",
  "restore.crossPlatformLocalSources": "Local plugins without a saved copy are listed separately and skipped; npm / GitHub plugins and configuration still restore.",
  "restore.pluginsTitle": "Plugins to reinstall ({count})",
  "restore.pluginsDesc": "Reinstalled automatically during restore.",
  "restore.manualTitle": "Manual steps required",
  "restore.confirmTitle": "Confirm restore",
  "restore.confirmDesc": "Restoring overwrites existing configuration; local edits that differ from the snapshot are lost.",
  "restore.rollback": "Create a rollback snapshot first",
  "restore.managePlugins": "Reinstall missing plugins",
  "restore.submit": "Restore",
  "restore.submitting": "Restoring\u2026",
  "restore.needConfirm": "Tick the confirmation first.",
  "restore.dialogTitle": "Restore snapshot {id}?",
  "restore.dialogBody": "{apply} files will be written, {keep} items skipped, {removed} removals reported only. This overwrites local configuration.",
  "restore.dialogConfirm": "Restore",
  "restore.successTitle": "Restore complete",
  "job.title.backup": "Backup",
  "job.title.restore": "Restore",
  "job.title.retry-plugins": "Retry plugins",
  "job.elapsed": "{time} elapsed",
  "job.stage.backup.prepare": "Preparing",
  "job.stage.backup.collect": "Collecting files",
  "job.stage.backup.copies": "Packing plugin copies",
  "job.stage.backup.pack": "Compressing",
  "job.stage.backup.encrypt": "Encrypting",
  "job.stage.backup.upload": "Uploading / saving",
  "job.stage.backup.done": "Done",
  "job.stage.backup.rollback": "Creating rollback snapshot",
  "job.stage.backup.apply": "Writing files",
  "job.stage.backup.reinstall": "Installing plugins",
  "job.stage.backup.verify": "Verifying",
  "job.stage.restore.prepare": "Preparing",
  "job.stage.restore.rollback": "Creating rollback snapshot",
  "job.stage.restore.apply": "Writing files",
  "job.stage.restore.reinstall": "Installing plugins",
  "job.stage.restore.verify": "Verifying",
  "job.stage.restore.done": "Done",
  "job.stage.restore.collect": "Collecting files",
  "job.stage.restore.copies": "Packing plugin copies",
  "job.stage.restore.pack": "Compressing",
  "job.stage.restore.encrypt": "Encrypting",
  "job.stage.restore.upload": "Saving",
  "summary.restartDsh": "Restore has fully finished. Restart dsh (quit Desktop completely and reopen it) to load the plugins and settings.",
  "summary.restartPartial": "Restore finished, but {count} plugin(s) failed to install. Restart dsh (quit Desktop completely and reopen it) to load the restored plugins and settings; you can retry the failed plugins below.",
  "summary.restartFailedWritten": "Restore did not complete, but {files} file(s) were already written. You can undo them with the rollback snapshot above; if you keep them, restart dsh (quit Desktop completely and reopen it) for them to take effect.",
  "summary.restore.ok": "Restore complete",
  "summary.restore.partial": "Restore partly complete",
  "summary.restore.failed": "Restore failed",
  "summary.restore.plugins": "plugins {ok} ok \xB7 {failed} failed",
  "summary.restore.pluginsOk": "plugins {ok} ok",
  "summary.restore.pluginsSkipped": "plugins {skipped} skipped",
  "summary.restore.files": "{applied} files written",
  "summary.restore.skipped": "{skipped} skipped",
  "summary.took": "took {time}",
  "summary.failedList": "Failed plugins ({count})",
  "summary.restartDesktop": "Restart Desktop to load the plugins; until then the Plugins page may show \u201Cpackage unavailable\u201D.",
  "summary.backup.ok": "Backup complete",
  "summary.backup.files": "{files} files",
  "summary.backup.copies": "{copies} plugin copies",
  "summary.backup.savedTo": "Saved to {location}",
  "restore.group.other": "Other",
  "restore.diffNoMatch": "No matching files.",
  "restore.diffSearch": "Filter paths",
  "restore.showUnchanged": "Show unchanged",
  "restore.expandAll": "Expand all",
  "restore.collapseAll": "Collapse all",
  "restore.showMore": "Show more ({count} left)",
  "restore.unchangedHidden": "{count} unchanged files hidden",
  "restore.diffOnlyUnchanged": "No differences; {count} files match",
  "restore.diffGroupAllSame": "Every file in this group matches",
  "restore.successBody": "{applied} files applied, {skipped} skipped.",
  "restore.partialBody": "Config written ({applied} files, {skipped} skipped), but some plugins failed \u2014 not a full restore.",
  "restore.rollbackCreated": "Rollback snapshot: {id}",
  "restore.pluginsReinstalled": "Reinstalled: {list}",
  "restore.pluginsFailed": "Install failed: {list}",
  "restore.restartHint": "Some changes may need a dsh restart.",
  "restore.restartRequired": "Restart DeepSeek Harness Desktop (or dsh web) so newly installed plugins load.",
  "restore.failedTitle": "Restore failed",
  "restore.resultTitle": "Plugin results",
  "restore.resultDesc": "{ok} ready, {failed} failed",
  "restore.resultDescWithSkipped": "{ok} ready, {failed} failed, {skipped} skipped",
  "restore.status.installed": "Installed",
  "restore.status.installed-from-backup": "Installed from backup",
  "restore.status.already-present": "Ready",
  "restore.status.failed": "Failed",
  "restore.status.skipped": "Skipped",
  "restore.reason.foreign-local-source": "This plugin uses a local path from another operating system: {subject}. It cannot be opened here, and the snapshot has no saved copy. Install it on this machine, or back up again on the original machine with the current dsh-vault.",
  "restore.reason.local-source-missing": "Local plugin folder missing: {subject} on the original machine; update dsh-vault there and back up again",
  "restore.reason.tarball-missing": "Local package file missing: {subject} on the original machine; update dsh-vault there and back up again",
  "restore.reason.unsupported-spec": "Spec {subject} only resolves inside the original workspace",
  "restore.reason.blocked-by-other": "Blocked by another unresolvable dependency: {subject}",
  "restore.reason.registry-not-found": "{subject} not found in the npm registry (or no access)",
  "copies.title": "Plugin copies",
  "copies.desc": "Store each installed plugin package in the snapshot. Restore installs from the copy when the registry lacks that version or the plugin is local.",
  "copies.enable": "Save plugin copies",
  "copies.enableDesc": "On by default for every plugin. Turning it off makes snapshots smaller, but unpublished versions and local plugins may not install on another machine.",
  "copies.order": "On restore",
  "copies.orderDesc": "Plugins whose version is not on the registry always use the copy.",
  "copies.order.source-first": "Install from source first, then the copy",
  "copies.order.copy-first": "Prefer the saved copy",
  "copies.loading": "Loading plugins",
  "copies.checking": "Checking versions on the npm registry\u2026",
  "copies.none": "No plugins detected.",
  "copies.recommended": "Copy recommended",
  "copies.kind.npm": "npm",
  "copies.kind.github": "GitHub",
  "copies.kind.local": "Local",
  "copies.hint.local": "Local plugin: its original path does not exist on another machine; only the copy can install it.",
  "copies.hint.missing": "Version {version} is not on the npm registry.",
  "copies.hint.cordisOnly": "Only in cordis.patch.yml / node_modules, not in package.json dependencies.",
  "restore.reason.not-resolvable": "{subject} is installed but dsh cannot resolve it from the profile folder (it would show \u201Cpackage unavailable\u201D); left unloaded \u2014 retry failed plugins, then restart Desktop",
  "restore.reason.no-recorded-source": "The backup has no recorded install source for {subject} and no saved copy; skipped (to avoid installing an unrelated npm package with the same name)",
  "restore.reason.integrity-mismatch": "{subject} on npm is a different package than the one backed up (integrity differs), and the backup has no copy; not installed",
  "restore.reason.self": "dsh-vault itself is never overwritten by a restore; this machine keeps its own installation",
  "restore.reason.source-not-approved": "this plugin would be downloaded from a git / tarball / URL source recorded in the snapshot; you did not allow it and the snapshot has no saved copy, so it was skipped",
  "restore.reason.invalid-spec": "the plugin record in the snapshot is malformed; refused",
  "restore.withSecrets": "Restore credentials",
  "restore.withSecretsDesc": "This encrypted snapshot carries API keys and other credentials. Turn off to keep the credentials on this machine untouched.",
  "restore.remoteSourcesTitle": "Allow installing plugins from these git / tarball / URL sources",
  "restore.remoteSourcesHint": "These sources are downloaded and installed during the restore. Only check sources you recognize; unchecked plugins use the saved copy from the snapshot when there is one, otherwise they are skipped.",
  "restore.remoteSourcesImportHint": "An imported file is not trusted, so nothing is checked by default. Only check sources you recognize; unchecked plugins use the saved copy from the snapshot when there is one, otherwise they are skipped.",
  "restore.untrustedSource": "Not on the trusted list (npm registry / npmmirror, github.com), so unchecked by default; check it only if you are sure.",
  "restore.archiveLimit": "This machine unpacks snapshots up to {size}.",
  "unfinished.title": "The last restore did not finish",
  "unfinished.body": "The process stopped while restoring {snapshot} (started {time}); files may be only partly restored. Restore the pre-restore rollback snapshot to go back.",
  "unfinished.bodyNoRollback": "The process stopped while restoring {snapshot} (started {time}); files may be only partly restored. No rollback snapshot was made for that restore, so check your setup or restore again.",
  "unfinished.encrypted": "The rollback snapshot is encrypted with that restore password.",
  "unfinished.rollback": "Open rollback snapshot",
  "unfinished.dismiss": "Dismiss",
  "restore.credentialsWritten": "Credential files written: {files}",
  "restore.credentialsUntouched": "Credential files were not modified.",
  "backup.overwriteConfirm": "The export file already exists. Overwrite it?",
  "restore.reason.no-backup-copy": "{subject} is not on the npm registry and this backup has no copy of it; back up again with the current \u5927\u80A5\u9C7C\u5907\u4EFD",
  "restore.reason.network": "Network error contacting the npm registry; check the connection and retry",
  "restore.reason.installer-missing": "No pnpm / dsh installer found; restore from inside DeepSeek Harness Desktop or install from Plugins",
  "restore.reason.missing-deps": "Installed but dependencies are missing: {subject}",
  "restore.reason.version-mismatch": "Version differs from the backup: {subject}",
  "restore.reason.incompatible": "Plugin version is not compatible with this dsh",
  "restore.reason.git-missing": "git is needed to install {subject} from GitHub and was not found; install Git for Windows, then retry failed plugins",
  "restore.reason.git-unavailable": "Cannot reach the git repository {subject} (deleted, private, or offline)",
  "restore.reason.unknown": "Install failed: {subject}",
  "restore.details": "Details",
  "restore.legend.fromBackup": "\u201CInstalled from backup\u201D: the exact version is gone from the registry/GitHub; the copy packed at backup time was used instead.",
  "restore.ok.linkedBundled": "Linked the plugin source from the backup",
  "restore.ok.bundledTarball": "Installed from the package file in the backup",
  "restore.ok.fromBackup": "Registry no longer has this version; installed the copy from the backup{version}",
  "restore.ok.linkedLocal": "Linked local source: {subject}",
  "restore.ok.installed": "Installed{version}",
  "restore.ok.present": "Already installed{version}",
  "restore.retryFailed": "Retry failed plugins",
  "restore.retrying": "Retrying\u2026",
  "restore.retryDesc": "After fixing the cause, reinstall only the failed plugins. Config is not rewritten.",
  "notice.reenterSecrets": "Re-enter API keys and other secrets in Settings \u2192 Models (credentials were excluded from this snapshot).",
  "notice.localSources": "Some plugins used local link:/file: sources; reinstall or re-link them on this machine.",
  "notice.restartDesktop": "Restart DeepSeek Harness Desktop so newly installed plugins load.",
  "notice.restartWeb": "Restart dsh web / the host so newly installed plugins load.",
  "notice.crossPlatformLocalSources": "This snapshot came from another operating system. Local plugin paths from that system cannot be used here; plugins without a saved copy are listed separately and skipped, while other plugins and configuration still restore.",
  "notice.removedForeignDeps": "Removed plugin entries that pointed at the other computer's local files. Install those plugins again on this machine if you still need them.",
  "notice.partialRestore": "Restore finished with plugin failures \u2014 not a full success. Fix the cause and use \u201CRetry failed plugins\u201D, or install them from Desktop \u2192 Plugins.",
  "notice.launchDesktopOnce": "Launch DeepSeek Harness Desktop once so $DSH_HOME/profiles/desktop is created, then fully quit it.",
  "notice.useBundledDsh": "Run the command with Desktop's bundled dsh (Tray \u2192 Terminal, or dsh / dsh.cmd next to the app); npm-global dsh refuses the desktop profile.",
  "notice.installFromPlugins": "Or install from Desktop \u2192 Plugins while Desktop is running.",
  "notice.reopenDesktop": "Reopen Desktop after installing so the bundle loads.",
  "storage.desc": "Where snapshots are written: local folders, GitHub, WebDAV or S3-compatible storage.",
  "storage.emptyTitle": "No storage locations yet",
  "storage.emptyBody": "Add a local folder to start backing up.",
  "storage.targetsLabel": "Configured storage locations",
  "storage.snapshots": "{count} snapshots",
  "storage.lastBackup": "Last {time}",
  "storage.noSnapshots": "Not backed up yet",
  "storage.storedCredentials": "Credentials saved",
  "storage.test": "Test connection",
  "storage.testing": "Testing\u2026",
  "storage.testOk": "Connection OK, {count} snapshots",
  "storage.testFail": "Connection failed: {error}",
  "storage.edit": "Edit",
  "storage.delete": "Delete",
  "storage.deleteTitle": "Delete storage location \u201C{label}\u201D?",
  "storage.deleteBody": "Only the configuration is removed; uploaded snapshot files are kept.",
  "storage.deleteConfirm": "Delete",
  "storage.addTitle": "Add storage location",
  "storage.addDesc": "Pick a type and fill in the connection details.",
  "storage.editTitle": "Edit storage location",
  "storage.kind": "Type",
  "storage.kind.local": "Local folder",
  "storage.kind.github": "GitHub repository",
  "storage.kind.webdav": "WebDAV",
  "storage.kind.s3": "S3 compatible",
  "storage.id": "ID",
  "storage.idHint": "Unique, e.g. nas, r2",
  "storage.label": "Name",
  "storage.directory": "Directory",
  "storage.directoryHint": "~ is supported",
  "storage.owner": "Owner",
  "storage.repo": "Repository",
  "storage.branch": "Branch",
  "storage.pathPrefix": "Path prefix",
  "storage.tokenCredential": "Credential ref",
  "storage.token": "Access token",
  "storage.tokenHint": "Leave empty to use the credential ref",
  "storage.url": "URL",
  "storage.username": "Username",
  "storage.password": "Password",
  "storage.passwordKeep": "Leave empty to keep the saved password",
  "storage.endpoint": "Endpoint",
  "storage.region": "Region",
  "storage.bucket": "Bucket",
  "storage.accessKey": "Access key",
  "storage.secretKey": "Secret key",
  "storage.secretKeep": "Leave empty to keep the saved key",
  "storage.forcePathStyle": "Path-style URLs",
  "storage.forcePathStyleDesc": "Needed by MinIO, R2 and most compatible servers.",
  "storage.encDefault": "Encrypt by default",
  "storage.encDefaultDesc": "Snapshots for this location are encrypted by default.",
  "storage.missing": "Fill in: {fields}",
  "storage.idExists": "This ID already exists; saving overwrites it.",
  "storage.saveNew": "Save",
  "storage.saveEdit": "Save",
  "storage.saved": "Saved \u201C{label}\u201D",
  "storage.deleted": "Deleted \u201C{label}\u201D",
  "storage.cancel": "Cancel",
  "storage.snapshotsCount": "{count}",
  "storage.addKind": "Add {kind}",
  "snapshots.desc": "View, verify and delete snapshots across all storage locations.",
  "snapshots.search": "Search snapshot ID or notes",
  "snapshots.filterTarget": "Storage location",
  "snapshots.filterMode": "Encryption",
  "snapshots.mode.all": "All",
  "snapshots.mode.encrypted": "Encrypted",
  "snapshots.mode.plaintext": "Plaintext",
  "snapshots.mode.secrets": "With secrets",
  "snapshots.count": "{shown} / {total}",
  "snapshots.emptyTitle": "No snapshots yet",
  "snapshots.emptyBody": "Snapshots appear here after the first backup.",
  "snapshots.noMatch": "No matching snapshots.",
  "snapshots.clear": "Clear filters",
  "snapshots.verify": "Verify",
  "snapshots.verified": "Verified",
  "snapshots.verifyOk": "Verified",
  "snapshots.verifyFail": "Verification failed: {error}",
  "snapshots.verifyPassword": "Password",
  "snapshots.verifyPasswordHint": "This snapshot is encrypted; verification needs its password.",
  "snapshots.verifying": "Verifying\u2026",
  "snapshots.restoreAction": "Restore",
  "snapshots.deleteTitle": "Delete snapshot {id}?",
  "snapshots.deleteBody": "Permanently deleted from \u201C{target}\u201D. This cannot be undone.",
  "snapshots.deleteConfirm": "Delete permanently",
  "snapshots.deleted": "Deleted snapshot {id}",
  "snapshots.truncated": "Showing the first {shown} snapshots.",
  "snapshots.goBackup": "Open Backup",
  "schedule.desc": "Create snapshots automatically at an interval while dsh is running.",
  "schedule.enabled": "Enable auto backup",
  "schedule.enabledDesc": "Runs while the host plugin is loaded.",
  "schedule.interval": "Interval",
  "schedule.interval.desc": "Next run: {next}",
  "schedule.lastRun": "Last run",
  "schedule.target": "Back up to",
  "schedule.targetMissing": "The selected storage location no longer exists; pick another.",
  "schedule.encrypt": "Encrypt",
  "schedule.encryptDesc": "Scheduled runs cannot ask for a password; target defaults apply.",
  "schedule.secrets": "Include credentials",
  "schedule.secretsDescEncrypted": "Secrets stay inside the encrypted payload.",
  "schedule.secretsDescHalted": "Enable encryption first.",
  "schedule.runNow": "Run now",
  "schedule.runNowDesc": "Run the scheduled backup once.",
  "schedule.runDisabled": "Enable auto backup to run it manually.",
  "schedule.save": "Save",
  "schedule.saving": "Saving\u2026",
  "schedule.saved": "Saved",
  "schedule.dirty": "Unsaved changes",
  "schedule.discard": "Discard",
  "schedule.intervalLabel": "Presets",
  "schedule.custom": "Custom",
  "schedule.customUnit": "minutes",
  "schedule.intervalMin": "At least 15 minutes.",
  "schedule.interval.every15": "Every 15 min",
  "schedule.interval.every30": "Every 30 min",
  "schedule.interval.every60": "Hourly",
  "schedule.interval.every360": "Every 6 h",
  "schedule.interval.every720": "Every 12 h",
  "schedule.interval.every1440": "Daily",
  "schedule.interval.every10080": "Weekly",
  "schedule.retentionTitle": "Retention",
  "schedule.retentionDesc": "Old snapshots beyond the limit are pruned after each backup.",
  "schedule.keepLast": "Keep per storage location",
  "schedule.keepLastUnit": "snapshots",
  "schedule.keepLastHint": "Between 1 and 200.",
  "schedule.defaultsTitle": "Defaults",
  "schedule.defaultTarget": "Default storage location",
  "schedule.defaultTargetDesc": "Pre-selected on the Backup tab.",
  "schedule.kdf": "Key derivation",
  "schedule.kdfDesc": "argon2id needs a host-provided implementation.",
  "schedule.kdf.scrypt": "scrypt",
  "schedule.kdf.argon2id": "argon2id",
  "schedule.language": "Language",
  "schedule.languageDesc": "Follows the dsh interface language; Simplified Chinese by default.",
  "schedule.lang.auto": "Follow dsh",
  "schedule.lang.zh": "\u7B80\u4F53\u4E2D\u6587",
  "schedule.lang.en": "English",
  "schedule.runDone": "Auto backup finished: {id}",
  "schedule.runSkipped": "Auto backup is off.",
  "schedule.loading": "Loading settings\u2026",
  "time.justNow": "just now",
  "time.minutesAgo": "{n} min ago",
  "time.hoursAgo": "{n} h ago",
  "time.daysAgo": "{n} d ago",
  "time.inMinutes": "in {n} min",
  "time.inHours": "in {n} h",
  "time.inDays": "in {n} d"
};
var dictionaries = { zh, en };
function translate(locale, key, vars) {
  const dict = dictionaries[locale] ?? zh;
  let text = dict[key] ?? dictionaries.zh[key] ?? key;
  if (vars) {
    for (const [name2, value] of Object.entries(vars)) {
      text = text.split(`{${name2}}`).join(String(value));
    }
  }
  return text;
}
function normalizeLocale(tag) {
  if (tag && /^en/i.test(tag)) return "en";
  return "zh";
}
function detectInitialLocale(hostTag) {
  if (hostTag) return normalizeLocale(hostTag);
  if (typeof navigator !== "undefined" && navigator.language && /^en/i.test(navigator.language)) return "en";
  return "zh";
}
var zhTranslate = (key, vars) => translate("zh", key, vars);
var I18nContext = (0, import_react.createContext)({ locale: "zh", t: zhTranslate });
function useT() {
  return (0, import_react.useContext)(I18nContext).t;
}
function useLocale() {
  return (0, import_react.useContext)(I18nContext).locale;
}

// src/client/lib/targets.ts
function newestFirst(a, b) {
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}
function targetKindLabel(t, tr) {
  switch (t.kind) {
    case "local":
      return tr("kind.local");
    case "github":
      return tr("kind.github");
    case "webdav":
      return tr("kind.webdav");
    case "s3":
      return tr("kind.s3");
    default: {
      const _exhaustive = t;
      void _exhaustive;
      return "unknown";
    }
  }
}
function targetLocation(t) {
  switch (t.kind) {
    case "local":
      return t.directory;
    case "github":
      return `${t.owner}/${t.repo}${t.branch ? `@${t.branch}` : ""}${t.pathPrefix ? `/${t.pathPrefix}` : ""}`;
    case "webdav":
      return t.pathPrefix ? `${t.url.replace(/\/$/, "")}/${t.pathPrefix}` : t.url;
    case "s3":
      return `${t.endpoint.replace(/\/$/, "")}/${t.bucket}${t.pathPrefix ? `/${t.pathPrefix}` : ""}`;
    default: {
      const _exhaustive = t;
      void _exhaustive;
      return "";
    }
  }
}
function hasStoredSecret(t) {
  if (t.kind === "webdav") return Boolean(t.password);
  if (t.kind === "s3") return Boolean(t.secretAccessKey);
  if (t.kind === "github") return Boolean(t.token) || Boolean(t.tokenCredential);
  return false;
}
function summarizeSnapshotsByTarget(targets, snapshots) {
  return targets.map((target) => {
    const list = snapshots.filter((s) => s.targetId === target.id).sort(newestFirst);
    return { target, count: list.length, latest: list[0] };
  });
}

// src/client/components/ui.tsx
var import_react2 = require("react");
var import_react_dom = require("react-dom");

// src/client/components/Icons.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function icon(paths, displayName) {
  function Icon({ size, strokeWidth = 1.8, ...rest }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        width: size ?? "1em",
        height: size ?? "1em",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true",
        focusable: "false",
        ...rest,
        children: paths
      }
    );
  }
  Icon.displayName = displayName;
  return Icon;
}
var IconChevronDown = icon(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m6 9 6 6 6-6" }), "IconChevronDown");
var IconChevronRight = icon(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m9 6 6 6-6 6" }), "IconChevronRight");
var IconAlert = icon(
  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 4v10" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12", cy: "19", r: "0.6", fill: "currentColor" })
  ] }),
  "IconAlert"
);
var IconEye = icon(
  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12", cy: "12", r: "3" })
  ] }),
  "IconEye"
);
var IconEyeOff = icon(
  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M3 3l18 18" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3 3.9M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a10.4 10.4 0 0 0 5.4-1.5" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M9.9 9.9a3 3 0 0 0 4.2 4.2" })
  ] }),
  "IconEyeOff"
);
var IconFolder = icon(
  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M3 7.5A1.5 1.5 0 0 1 4.5 6h4.4l2 2h8.6A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" }),
  "IconFolder"
);
var IconFile = icon(
  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M14 3v4h4" })
  ] }),
  "IconFile"
);

// src/client/components/ui.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}
function SectionHead({ title, description, id }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("header", { className: "dv-section-head", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { className: "dv-section-title", id, children: title }),
    description ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dv-section-desc", children: description }) : null
  ] });
}
function SectionTabs({ label, value, onChange, items }) {
  const refs = (0, import_react2.useRef)([]);
  const idx = Math.max(0, items.findIndex((i) => i.id === value));
  const move = (delta) => {
    const next = (idx + delta + items.length) % items.length;
    const item = items[next];
    if (!item) return;
    onChange(item.id);
    refs.current[next]?.focus();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dv-tabs", role: "tablist", "aria-label": label, children: items.map((item, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "button",
    {
      ref: (el) => {
        refs.current[i] = el;
      },
      type: "button",
      role: "tab",
      id: `dv-tab-${item.id}`,
      "aria-selected": value === item.id,
      "aria-controls": item.panelId,
      tabIndex: value === item.id ? 0 : -1,
      className: "dv-tab",
      onClick: () => onChange(item.id),
      onKeyDown: (e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          move(-1);
        } else if (e.key === "Home") {
          e.preventDefault();
          move(-idx);
        } else if (e.key === "End") {
          e.preventDefault();
          move(items.length - 1 - idx);
        }
      },
      children: item.label
    },
    item.id
  )) });
}
function Rows({ children, label }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dv-rows", role: "group", "aria-label": label, children });
}
function SettingRow({ title, description, control, stacked, htmlFor, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dv-row", "data-stack": stacked ? "true" : void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dv-row-text", children: [
      htmlFor ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "dv-row-title", htmlFor, children: title }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dv-row-title", children: title }),
      description ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dv-row-desc", children: description }) : null
    ] }),
    control !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dv-row-control", children: control }) : null,
    children
  ] });
}
function Card({ children, className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: cx("dv-card", className), children });
}
function CardList({ children, label }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dv-card-list", role: label ? "group" : void 0, "aria-label": label, children });
}
function CardHead({ title, sub, actions }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dv-card-head", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dv-card-title", children: title }),
      sub ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dv-card-sub", children: sub }) : null
    ] }),
    actions ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dv-card-actions", children: actions }) : null
  ] });
}
function Button({ variant = "secondary", size = "md", loading, block, icon: icon2, disabled, children, className, type = "button", ...rest }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "button",
    {
      type,
      className: cx("dv-btn", className),
      "data-variant": variant,
      "data-size": size,
      "data-block": block ? "true" : void 0,
      disabled: disabled || loading,
      "aria-busy": loading || void 0,
      ...rest,
      children: [
        loading ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dv-spinner", "aria-hidden": "true" }) : icon2,
        children
      ]
    }
  );
}
function IconButton({ label, variant = "default", children, className, type = "button", ...rest }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type, className: cx("dv-iconbtn", className), "data-variant": variant, "aria-label": label, title: label, ...rest, children });
}
function Chips({ label, value, options, onChange }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dv-chip-row", role: "group", "aria-label": label, children: options.map((o) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "button",
    {
      type: "button",
      className: "dv-chip",
      "aria-pressed": o.value === value,
      onClick: () => onChange(o.value),
      children: o.label
    },
    String(o.value)
  )) });
}
function Field({ label, htmlFor, hint, error, optional, children, className }) {
  const t = useT();
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: cx("dv-field", className), children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "dv-label", htmlFor, children: [
      label,
      optional ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dv-muted", children: t("common.optional") }) : null
    ] }),
    children,
    error ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dv-hint", id: htmlFor ? `${htmlFor}-error` : void 0, "data-tone": "error", style: { color: "var(--dv-danger)" }, children: error }) : hint ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dv-hint", id: htmlFor ? `${htmlFor}-hint` : void 0, children: hint }) : null
  ] });
}
function TextInput({ mono, invalid, className, ...rest }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className: cx("dv-input", mono && "dv-mono", className), "aria-invalid": invalid || void 0, ...rest });
}
function PasswordInput({ className, ...rest }) {
  const t = useT();
  const [visible, setVisible] = (0, import_react2.useState)(false);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dv-input-group", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: visible ? "text" : "password", className: cx("dv-input", className), autoComplete: "off", spellCheck: false, ...rest }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      IconButton,
      {
        label: visible ? t("app.hidePassword") : t("app.showPassword"),
        "aria-pressed": visible,
        onClick: () => setVisible((v) => !v),
        children: visible ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(IconEyeOff, { size: 15 }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(IconEye, { size: 15 })
      }
    )
  ] });
}
function Checkbox({ title, description, disabled, id, ...rest }) {
  const autoId = (0, import_react2.useId)();
  const inputId = id ?? autoId;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "dv-check", "data-disabled": disabled ? "true" : void 0, htmlFor: inputId, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { id: inputId, type: "checkbox", disabled, ...rest }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dv-check-body", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dv-check-title", children: title }),
      description ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dv-check-desc", children: description }) : null
    ] })
  ] });
}
function Switch({ disabled, id, ...rest }) {
  const autoId = (0, import_react2.useId)();
  const inputId = id ?? autoId;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "dv-switch", "data-disabled": disabled ? "true" : void 0, htmlFor: inputId, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { id: inputId, type: "checkbox", role: "switch", disabled, ...rest }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dv-switch-track", "aria-hidden": "true" })
  ] });
}
function OptionTile({ checked, onChange, name: name2, title, description, shape = "round", disabled }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "dv-option", "data-selected": checked ? "true" : void 0, "data-shape": shape, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: shape === "square" ? "checkbox" : "radio", name: name2, checked, disabled, onChange }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dv-option-mark", "aria-hidden": "true", children: checked ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", {}) : null }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dv-option-body", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dv-option-title", children: title }),
      description ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dv-option-desc", children: description }) : null
    ] })
  ] });
}
function Segmented({ value, onChange, options, label }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dv-segment", role: "group", "aria-label": label, children: options.map((o) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", "aria-pressed": value === o.value, onClick: () => onChange(o.value), children: [
    o.label,
    typeof o.count === "number" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dv-count", children: o.count }) : null
  ] }, o.value)) });
}
function Select({ children, className, block, ...rest }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("select", { className: cx("dv-select", className), "data-block": block ? "true" : void 0, ...rest, children });
}
function SearchInput({ value, onChange, placeholder, label, id }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "input",
    {
      id,
      type: "search",
      className: "dv-input",
      placeholder,
      "aria-label": label,
      value,
      onChange: (e) => onChange(e.target.value),
      maxLength: 200
    }
  );
}
function StatusDot({ tone = "neutral" }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dv-dot", "data-tone": tone, "aria-hidden": "true" });
}
function DotText({ tone = "neutral", children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dv-dottext", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(StatusDot, { tone }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children })
  ] });
}
function Tag({ tone = "neutral", children, title }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dv-tag", "data-tone": tone, title, children });
}
function Banner({ tone = "info", title, children, actions, role }) {
  const autoRole = role ?? (tone === "error" ? "alert" : "status");
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dv-banner", "data-tone": tone, role: autoRole, "aria-live": tone === "error" ? "assertive" : "polite", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dv-banner-body", children: [
    title ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dv-banner-title", children: title }) : null,
    children ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children }) : null,
    actions ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dv-card-actions", children: actions }) : null
  ] }) });
}
function LoadingState({ label }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dv-loading-inline", role: "status", "aria-live": "polite", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dv-spinner", "aria-hidden": "true" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: label })
  ] });
}
function LoadingInline({ label }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dv-loading-inline", role: "status", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dv-spinner", "aria-hidden": "true" }),
    label
  ] });
}
function EmptyState({ title, body, actions }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dv-state", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dv-state-title", children: title }),
    body ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: body }) : null,
    actions ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dv-state-actions", children: actions }) : null
  ] });
}
function ErrorState({ error, title, onRetry }) {
  const t = useT();
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dv-state", "data-tone": "error", role: "alert", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dv-state-title", children: title ?? t("app.error") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { overflowWrap: "anywhere" }, children: error }),
    onRetry ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dv-state-actions", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { size: "sm", onClick: onRetry, children: t("app.retry") }) }) : null
  ] });
}
function ProgressBar({ value, label, detail }) {
  const indeterminate = typeof value !== "number" || !Number.isFinite(value);
  const pct = indeterminate ? 0 : Math.max(0, Math.min(100, value));
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dv-progress-meta", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { "aria-live": "polite", children: label }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dv-num", children: indeterminate ? "" : `${Math.round(pct)}%` })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "div",
      {
        className: "dv-progress",
        "data-indeterminate": indeterminate ? "true" : void 0,
        role: "progressbar",
        "aria-label": label,
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": indeterminate ? void 0 : Math.round(pct),
        "aria-valuetext": indeterminate ? label : `${Math.round(pct)}%`,
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: indeterminate ? void 0 : { width: `${pct}%` } })
      }
    ),
    detail ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dv-hint", style: { marginTop: 6 }, children: detail }) : null
  ] });
}
function Collapsible({ summary, children, defaultOpen }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("details", { className: "dv-details", open: defaultOpen ? true : void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("summary", { children: summary }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dv-details-body", children })
  ] });
}
var FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
function Dialog({ open, onClose, title, description, children, actions, tone = "default", size = "default" }) {
  const t = useT();
  const autoId = (0, import_react2.useId)();
  const baseId = autoId.replace(/[^a-zA-Z0-9_-]/g, "") || "x";
  const titleId = `dv-dialog-title-${baseId}`;
  const descId = `dv-dialog-desc-${baseId}`;
  const panelRef = (0, import_react2.useRef)(null);
  const restoreRef = (0, import_react2.useRef)(null);
  (0, import_react2.useEffect)(() => {
    if (!open) return;
    restoreRef.current = document.activeElement;
    const panel = panelRef.current;
    if (!panel) return;
    const first = panel.querySelector(FOCUSABLE);
    (first ?? panel).focus();
    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const nodes = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (nodes.length === 0) return;
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === firstNode) {
        e.preventDefault();
        lastNode.focus();
      } else if (!e.shiftKey && document.activeElement === lastNode) {
        e.preventDefault();
        firstNode.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const prev = restoreRef.current;
      if (prev instanceof HTMLElement && prev.isConnected) prev.focus();
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return (0, import_react_dom.createPortal)(
    // Portaled outside the section: re-apply the root class so --dv-* tokens resolve.
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "div",
      {
        className: "dsh-vault-root dv-dialog-backdrop",
        onMouseDown: (e) => {
          if (e.target === e.currentTarget) onClose();
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "div",
          {
            ref: panelRef,
            className: "dv-dialog",
            "data-size": size === "wide" ? "wide" : void 0,
            role: "dialog",
            "aria-modal": "true",
            "aria-labelledby": titleId,
            "aria-describedby": description ? descId : void 0,
            tabIndex: -1,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { className: "dv-dialog-title", id: titleId, children: title }),
              description ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "dv-dialog-desc", id: descId, children: description }) : null,
              children ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dv-dialog-body", children }) : null,
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dv-dialog-actions", children: actions ?? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { onClick: onClose, children: t("app.cancel") }) })
            ]
          }
        )
      }
    ),
    document.body
  );
}
function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel, danger = true, busy, onConfirm, onClose, children }) {
  const t = useT();
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    Dialog,
    {
      open,
      onClose: () => {
        if (!busy) onClose();
      },
      title,
      description,
      actions: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { onClick: onClose, disabled: busy, children: cancelLabel ?? t("app.cancel") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { variant: danger ? "danger-solid" : "primary", onClick: onConfirm, loading: busy, children: confirmLabel })
      ] }),
      children
    }
  );
}

// src/client/components/Dashboard.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function emptyStatus() {
  const settings = {
    retention: { keepLast: 0 },
    preferredKdf: "scrypt",
    pluginCopies: { enabled: true, exclude: [] },
    pluginRestoreOrder: "source-first",
    schedule: {
      enabled: false,
      intervalMinutes: 1440,
      targetId: "",
      encrypt: false,
      includeSecrets: false,
      retention: { keepLast: 0 }
    }
  };
  return { dshHome: "", dataDir: "", targets: [], settings, recentSnapshots: [] };
}
function Overview({
  status,
  loading,
  error,
  onRefresh,
  onBackup,
  snapshots,
  onBackupNow,
  backupBusy,
  onNavigate,
  message
}) {
  const tr = useT();
  const locale = useLocale();
  const data = status ?? (loading ? null : emptyStatus());
  const list = (0, import_react3.useMemo)(
    () => snapshots ?? data?.recentSnapshots ?? [],
    [snapshots, data]
  );
  if (!data) {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dv-section-desc", children: tr("overview.desc") }),
      error ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ErrorState, { error, onRetry: onRefresh }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(LoadingState, { label: tr("app.loading") })
    ] });
  }
  const settings = data.settings;
  const targets = data.targets;
  const summaries = summarizeSnapshotsByTarget(targets, list);
  const latest = [...list].sort(newestFirst)[0];
  const targetLabel = (id) => targetName(targets.find((t) => t.id === id), tr, id);
  const encrypted = list.filter((s) => s.encrypted).length;
  const totalBytes = list.reduce((acc, s) => acc + (s.bytes || 0), 0);
  const schedule = settings.schedule;
  const defaultTargetId = settings.defaultTargetId && targets.some((t) => t.id === settings.defaultTargetId) ? settings.defaultTargetId : targets[0]?.id;
  const defaultTarget = targets.find((t) => t.id === defaultTargetId);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dv-section-desc", children: tr("overview.desc") }),
    error ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ErrorState, { error, onRetry: onRefresh }) : null,
    message ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Banner, { tone: "ok", children: message }) : null,
    targets.length === 0 && !loading ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      EmptyState,
      {
        title: tr("overview.emptyTitle"),
        body: tr("overview.emptyBody"),
        actions: onNavigate ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { variant: "primary", onClick: () => onNavigate("storage"), children: tr("overview.goStorage") }) : null
      }
    ) : null,
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Rows, { label: tr("overview.desc"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        SettingRow,
        {
          title: tr("overview.lastTitle"),
          description: latest?.notes,
          control: latest ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dv-truncate", title: `${latest.id} \xB7 ${targetLabel(latest.targetId)}`, children: tr("overview.lastValue", {
            target: targetLabel(latest.targetId),
            time: formatWhen(latest.createdAt, locale)
          }) }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dv-muted", children: tr("overview.lastEmpty") })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        SettingRow,
        {
          title: tr("overview.snapshotsTitle"),
          description: list.length ? tr("overview.snapshotsDesc", { encrypted, plain: list.length - encrypted }) : void 0,
          control: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dv-num", children: list.length ? tr("overview.snapshotsValue", { count: list.length, size: formatBytes(totalBytes) }) : tr("overview.snapshotsEmpty") })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        SettingRow,
        {
          title: tr("overview.scheduleTitle"),
          control: schedule.enabled ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: schedule.nextRunAt ? tr("overview.scheduleValue", { interval: scheduleLabel(locale, schedule.intervalMinutes), time: formatWhen(schedule.nextRunAt, locale) }) : tr("overview.scheduleNoNext", { interval: scheduleLabel(locale, schedule.intervalMinutes) }) }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dv-muted", children: tr("overview.scheduleOff") })
        }
      ),
      summaries.map(({ target, count, latest: tLatest }) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        SettingRow,
        {
          title: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "dv-inline", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(DotText, { tone: count > 0 ? "ok" : "neutral", children: targetName(target, tr) }),
            target.id === defaultTargetId ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dv-tag", children: tr("common.default") }) : null
          ] }),
          description: count > 0 && tLatest ? tr("storage.lastBackup", { time: formatWhen(tLatest.createdAt, locale) }) : tr("storage.noSnapshots"),
          control: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dv-num dv-muted", children: tr("storage.snapshots", { count }) })
        },
        target.id
      )),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        SettingRow,
        {
          title: tr("overview.backupRow"),
          description: defaultTarget ? tr("overview.backupDescTarget", { target: targetName(defaultTarget, tr) }) : tr("overview.backupDesc"),
          control: onBackupNow ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            Button,
            {
              variant: "primary",
              onClick: targets.length ? onBackupNow : onBackup,
              loading: backupBusy,
              children: tr("overview.backupButton")
            }
          ) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { variant: "primary", onClick: onBackup, disabled: targets.length === 0, children: tr("overview.backupButton") })
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "dv-hint", children: tr("overview.secretsNote") }),
    loading ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(LoadingState, { label: tr("app.loading") }) : null
  ] });
}

// src/client/components/BackupPanel.tsx
var import_react6 = require("react");

// src/client/components/PathPicker.tsx
var import_react4 = require("react");

// src/client/notices.ts
var PATTERNS = [
  [/^Re-enter API keys/i, "notice.reenterSecrets"],
  [/^Some plugins used local link:\/file: sources/i, "notice.localSources"],
  [/^Restart DeepSeek Harness Desktop/i, "notice.restartDesktop"],
  [/^Restart dsh web/i, "notice.restartWeb"],
  [/^This snapshot was made on /i, "notice.crossPlatformLocalSources"],
  [/^Removed \d+ plugin entr/i, "notice.removedForeignDeps"],
  [/^Restore finished with plugin failures/i, "notice.partialRestore"],
  [/^Launch DeepSeek Harness Desktop once/i, "notice.launchDesktopOnce"],
  [/^Run the command with Desktop's bundled/i, "notice.useBundledDsh"],
  [/^Or install from Desktop → Plugins/i, "notice.installFromPlugins"],
  [/^Reopen Desktop after installing/i, "notice.reopenDesktop"]
];
function localizeNotice(text, t) {
  for (const [re, key] of PATTERNS) if (re.test(text.trim())) return t(key);
  return text;
}
function pluginReasonText(row, t) {
  if (row.status === "skipped" && row.reason) return t(`restore.reason.${row.reason}`, { subject: row.subject ?? row.name });
  if (row.status !== "failed") return pluginOkText(row, t);
  if (!row.reason) return row.detail;
  const subject = row.reason === "unknown" ? row.detail : row.subject ?? row.name;
  return t(`restore.reason.${row.reason}`, { subject });
}
function failedPluginLabels(rows, fallback) {
  const failed = (rows ?? []).filter((r) => r.status === "failed");
  if (!failed.length) return [...new Set(fallback)].join("\u3001");
  const profilesOf = /* @__PURE__ */ new Map();
  for (const r of failed) profilesOf.set(r.name, (profilesOf.get(r.name) ?? /* @__PURE__ */ new Set()).add(r.profile));
  return [...profilesOf].map(([name2, ps]) => `${name2}\uFF08${[...ps].join(" / ")}\uFF09`).join("\u3001");
}
function pluginOkText(row, t) {
  const d = row.detail ?? "";
  if (/^linked bundled source .*\.(tgz|tar\.gz)$/i.test(d)) return t("restore.ok.bundledTarball");
  if (/^linked bundled source/.test(d)) return t("restore.ok.linkedBundled");
  const local = /^linked local source (.+)$/.exec(d);
  if (local) return t("restore.ok.linkedLocal", { subject: local[1] ?? "" });
  const v = /@(\S+)\s*$/.exec(d);
  const version = v ? ` @${v[1]}` : "";
  if (row.status === "already-present" || /^already/.test(d)) return t("restore.ok.present", { version });
  if (row.status === "installed-from-backup" || /installed from backup|registry version unavailable|locked tarball/i.test(d)) {
    return t("restore.ok.fromBackup", { version });
  }
  if (row.status === "installed") return t("restore.ok.installed", { version });
  return d;
}
function pluginRawDetail(row, t) {
  if (row.log) return row.log;
  if (row.status !== "failed" && row.detail && row.detail !== pluginReasonText(row, t)) return row.detail;
  return void 0;
}
var PATH_REASONS = [
  [/the dsh-vault data folder is private/, "error.path.private"],
  [/credential folders are off limits/, "error.path.credentials"],
  [/system folders are off limits/, "error.path.system"],
  [/outside the approved folders/, "error.path.outside"],
  [/only \.tar\.gz \/ \.dshvault snapshot files/, "error.path.notArchive"],
  [/path must be absolute/, "error.path.relative"]
];
function localizeError(err, t) {
  const message = err instanceof Error ? err.message : String(err);
  const code = err?.code;
  const status = err?.status;
  const suffix = typeof status === "number" && status ? ` (HTTP ${status})` : "";
  if (code === "PATH_NOT_ALLOWED") {
    const path = /\): (.*)$/.exec(message)?.[1] ?? "";
    const hit = PATH_REASONS.find(([re]) => re.test(message));
    if (hit) return `${t(hit[1], { path })}${suffix}`;
  }
  if (code === "BAD_SNAPSHOT") return `${t("error.badSnapshot")}${suffix}`;
  if (code === "SNAPSHOT_NOT_FOUND" && /no snapshot in folder/.test(message)) return `${t("error.noSnapshotInFolder")}${suffix}`;
  return `${message}${suffix}`;
}

// src/client/components/PathPicker.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var ARCHIVE_RE = /\.(tar\.gz|tgz|dshvault)$/i;
function isArchiveName(name2) {
  return ARCHIVE_RE.test(name2);
}
function joinPath(dir, name2, sep = "/") {
  if (!dir) return name2;
  return dir.endsWith("/") || dir.endsWith("\\") ? `${dir}${name2}` : `${dir}${sep}${name2}`;
}
function parentOf(p) {
  const trimmed = p.replace(/[\\/]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (idx < 0) return null;
  if (idx === 0) return trimmed.slice(0, 1);
  const head = trimmed.slice(0, idx);
  return /^[A-Za-z]:$/.test(head) ? `${head}\\` : head;
}
function baseName(p) {
  const parts = p.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] ?? "";
}
function formatBytes2(n) {
  if (n === void 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function PathPicker({ open, mode, fs, initialPath, defaultFileName, onSelect, onClose }) {
  const tr = useT();
  const [listing, setListing] = (0, import_react4.useState)(null);
  const [loading, setLoading] = (0, import_react4.useState)(false);
  const [error, setError] = (0, import_react4.useState)(null);
  const [pathInput, setPathInput] = (0, import_react4.useState)("");
  const [selectedFile, setSelectedFile] = (0, import_react4.useState)(null);
  const [showHidden, setShowHidden] = (0, import_react4.useState)(false);
  const [creating, setCreating] = (0, import_react4.useState)(false);
  const [newName, setNewName] = (0, import_react4.useState)("");
  const [fileName, setFileName] = (0, import_react4.useState)("");
  const [nativeBusy, setNativeBusy] = (0, import_react4.useState)(false);
  const load = (0, import_react4.useCallback)(async (path, fallbacks = []) => {
    setLoading(true);
    setError(null);
    const tries = [path, ...fallbacks];
    let lastErr = null;
    for (const p of tries) {
      try {
        const next = await fs.list(p);
        setListing(next);
        setPathInput(next.path);
        setSelectedFile(null);
        setLoading(false);
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    setLoading(false);
    setError(lastErr instanceof Error ? lastErr.message : String(lastErr));
  }, [fs]);
  (0, import_react4.useEffect)(() => {
    if (!open) return;
    setCreating(false);
    setNewName("");
    setError(null);
    const start = (initialPath ?? "").trim();
    const isFileLike = mode !== "directory" && (isArchiveName(start) || /\.[A-Za-z0-9]{1,8}$/.test(baseName(start)));
    if (mode === "save") setFileName(isFileLike ? baseName(start) : defaultFileName ?? "");
    const parent = start ? parentOf(start) : null;
    const first = isFileLike ? parent ?? "" : start;
    const fallbacks = [parent, ""].filter((x) => x !== null && x !== first);
    void load(first, fallbacks);
  }, [open, mode, initialPath, defaultFileName, load]);
  if (!open) return null;
  const sep = listing?.sep ?? "/";
  const entries = (listing?.entries ?? []).filter((e) => showHidden || !e.hidden);
  const visible = mode === "open" ? entries.filter((e) => e.kind === "directory" || isArchiveName(e.name)) : entries;
  const title = mode === "directory" ? tr("picker.title.directory") : mode === "open" ? tr("picker.title.open") : tr("picker.title.save");
  async function createFolder() {
    if (!listing || !newName.trim()) return;
    try {
      const r = await fs.mkdir(listing.path, newName.trim());
      setCreating(false);
      setNewName("");
      await load(r.path);
    } catch (err) {
      setError(localizeError(err, tr));
    }
  }
  async function useNative() {
    if (!fs.pickNative) return;
    setNativeBusy(true);
    setError(null);
    try {
      const r = await fs.pickNative();
      if (r.path) onSelect(r.path);
    } catch (err) {
      setError(tr("picker.nativeFailed", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setNativeBusy(false);
    }
  }
  const cwd = listing?.path ?? "";
  const savePath = mode === "save" && cwd && fileName.trim() ? joinPath(cwd, fileName.trim(), sep) : null;
  const actions = /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
    mode === "directory" && listing?.nativePicker && fs.pickNative ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Button, { variant: "quiet", onClick: () => {
      void useNative();
    }, loading: nativeBusy, style: { marginRight: "auto" }, children: tr("picker.native") }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Button, { onClick: onClose, children: tr("app.cancel") }),
    mode === "directory" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Button, { variant: "primary", disabled: !cwd || loading, onClick: () => onSelect(cwd), children: tr("picker.selectFolder") }) : null,
    mode === "open" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Button, { disabled: !cwd || loading, onClick: () => onSelect(cwd), children: tr("picker.selectFolder") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Button, { variant: "primary", disabled: !selectedFile, onClick: () => {
        if (selectedFile) onSelect(selectedFile);
      }, children: tr("picker.selectFile") })
    ] }) : null,
    mode === "save" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Button, { variant: "primary", disabled: !savePath, onClick: () => {
      if (savePath) onSelect(savePath);
    }, children: tr("picker.saveHere") }) : null
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(Dialog, { open, onClose, title, size: "wide", actions, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dv-picker-bar", children: [
      listing?.roots && listing.roots.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        Select,
        {
          "aria-label": tr("picker.roots"),
          value: listing.roots.find((r) => cwd.toLowerCase().startsWith(r.toLowerCase())) ?? "",
          onChange: (e) => {
            if (e.target.value) void load(e.target.value);
          },
          children: listing.roots.map((r) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: r, children: r }, r))
        }
      ) : null,
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Button, { size: "sm", variant: "quiet", onClick: () => void load(listing?.home ?? ""), disabled: loading, children: tr("picker.home") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Button, { size: "sm", variant: "quiet", onClick: () => {
        if (listing?.parent) void load(listing.parent);
      }, disabled: loading || !listing?.parent, children: tr("picker.up") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Button, { size: "sm", variant: "quiet", onClick: () => setCreating((v) => !v), disabled: !listing, children: tr("picker.newFolder") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      "form",
      {
        className: "dv-picker-bar",
        onSubmit: (e) => {
          e.preventDefault();
          void load(pathInput);
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(TextInput, { "aria-label": tr("picker.path"), value: pathInput, onChange: (e) => setPathInput(e.target.value), mono: true }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Button, { size: "sm", type: "submit", disabled: loading, children: tr("picker.go") })
        ]
      }
    ),
    creating ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("form", { className: "dv-picker-bar", onSubmit: (e) => {
      e.preventDefault();
      void createFolder();
    }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(TextInput, { "aria-label": tr("picker.newFolderName"), placeholder: tr("picker.newFolderName"), value: newName, onChange: (e) => setNewName(e.target.value), autoFocus: true }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Button, { size: "sm", type: "submit", variant: "primary", disabled: !newName.trim(), children: tr("picker.create") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Button, { size: "sm", variant: "quiet", onClick: () => {
        setCreating(false);
        setNewName("");
      }, children: tr("app.cancel") })
    ] }) : null,
    error ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Banner, { tone: "error", role: "alert", children: error }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dv-picker-list", role: "listbox", "aria-label": title, "aria-busy": loading || void 0, children: [
      loading && !listing ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dv-picker-empty", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(LoadingInline, { label: tr("picker.loading") }) }) : null,
      listing && visible.length === 0 && !loading ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dv-picker-empty", children: tr("picker.empty") }) : null,
      visible.map((e) => {
        const isDir = e.kind === "directory";
        const disabled = !isDir && mode === "directory";
        const selected = !isDir && (selectedFile === e.path || mode === "save" && fileName === e.name);
        return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
          "button",
          {
            type: "button",
            role: "option",
            "aria-selected": selected,
            className: "dv-picker-item",
            "data-selected": selected ? "true" : void 0,
            "data-hidden": e.hidden ? "true" : void 0,
            disabled,
            onClick: () => {
              if (isDir) {
                void load(e.path);
                return;
              }
              if (mode === "open") setSelectedFile(e.path);
              if (mode === "save") setFileName(e.name);
            },
            onDoubleClick: () => {
              if (!isDir && mode === "open") onSelect(e.path);
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dv-picker-icon", children: isDir ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(IconFolder, {}) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(IconFile, {}) }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dv-picker-name", children: e.name }),
              !isDir ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dv-picker-size dv-num", children: formatBytes2(e.bytes) }) : null
            ]
          },
          e.path
        );
      })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dv-picker-foot", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Checkbox, { title: tr("picker.showHidden"), checked: showHidden, onChange: (e) => setShowHidden(e.target.checked) }),
      mode === "open" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dv-small dv-muted", children: tr("picker.archiveOnly") }) : null
    ] }),
    mode === "save" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(TextInput, { "aria-label": tr("picker.fileName"), placeholder: tr("picker.fileName"), value: fileName, onChange: (e) => setFileName(e.target.value), mono: true }) : null,
    mode === "save" && savePath ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dv-small dv-muted dv-mono", style: { overflowWrap: "anywhere" }, children: savePath }) : null
  ] });
}

// src/client/restart-notice.ts
function restartNotice(r) {
  const rows = r.pluginResults ?? [];
  const failed = rows.filter((x) => x.status === "failed").length;
  const good = rows.length - failed;
  const files = r.applied?.length ?? 0;
  if (!failed && r.ok !== false) return { key: "summary.restartDsh" };
  if (failed && (good > 0 || files > 0)) return { key: "summary.restartPartial", vars: { count: failed } };
  if (files > 0) return { key: "summary.restartFailedWritten", vars: { files } };
  return null;
}

// src/client/components/ResultSummary.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function formatDuration(ms) {
  if (ms === void 0 || !Number.isFinite(ms)) return "";
  if (ms < 1e3) return ms < 100 ? "<0.1s" : `${(ms / 1e3).toFixed(1)}s`;
  if (ms < 1e4) return `${(ms / 1e3).toFixed(1)}s`;
  const s = Math.max(0, Math.round(ms / 1e3));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}
function pluginCounts(r) {
  const rows = r.pluginResults ?? [];
  const failed = rows.filter((x) => x.status === "failed").length;
  const skipped = rows.filter((x) => x.status === "skipped").length;
  return { ok: rows.length - failed - skipped, failed, skipped };
}
function restoreState(r) {
  const { ok, failed } = pluginCounts(r);
  if (!failed && r.ok !== false) return "ok";
  const good = ok;
  return good > 0 || r.applied.length > 0 ? "partial" : "failed";
}
function restoreHeadline(r, tr) {
  const { ok, failed, skipped } = pluginCounts(r);
  const parts = [];
  if (ok || failed) parts.push(failed ? tr("summary.restore.plugins", { ok, failed }) : tr("summary.restore.pluginsOk", { ok }));
  if (skipped) parts.push(tr("summary.restore.pluginsSkipped", { skipped }));
  parts.push(tr("summary.restore.files", { applied: r.applied.length }));
  if (r.skipped.length) parts.push(tr("summary.restore.skipped", { skipped: r.skipped.length }));
  if (r.durationMs !== void 0) parts.push(tr("summary.took", { time: formatDuration(r.durationMs) }));
  const state = restoreState(r);
  return `${tr(`summary.restore.${state}`)}\uFF1A${parts.join("\uFF0C")}`;
}
function RestoreSummary({
  result,
  detail,
  onRetry,
  retrying
}) {
  const tr = useT();
  const state = restoreState(result);
  const failedRows = (result.pluginResults ?? []).filter((r) => r.status === "failed");
  const notice = restartNotice(result);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    Banner,
    {
      tone: state === "ok" ? "ok" : state === "partial" ? "warn" : "error",
      role: state === "ok" ? "status" : "alert",
      title: restoreHeadline(result, tr),
      actions: failedRows.length && onRetry ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { size: "sm", onClick: onRetry, loading: retrying, disabled: retrying, title: tr("restore.retryDesc"), children: retrying ? tr("restore.retrying") : tr("restore.retryFailed") }) : void 0,
      children: [
        failedRows.length ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("details", { className: "dv-details", open: failedRows.length <= 3, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("summary", { children: tr("summary.failedList", { count: failedRows.length }) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "dv-result-list", children: failedRows.map((r) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dv-mono", children: r.name }),
            " ",
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "dv-muted", children: [
              "(",
              r.profile,
              ")"
            ] }),
            "\uFF1A",
            pluginReasonText(r, tr)
          ] }, `${r.profile}:${r.name}`)) })
        ] }) : null,
        result.rollbackSnapshotId ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dv-hint", children: tr("restore.rollbackCreated", { id: result.rollbackSnapshotId }) }) : null,
        result.credentialsWritten ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dv-hint", children: result.credentialsWritten.length ? tr("restore.credentialsWritten", { files: result.credentialsWritten.join(", ") }) : tr("restore.credentialsUntouched") }) : null,
        notice ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "dv-restart-notice", children: tr(notice.key, notice.vars) }) : null,
        detail ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dv-hint", children: detail }) : null
      ]
    }
  );
}
function backupCounts(result) {
  const m = result.manifest;
  const files = typeof m?.fileCount === "number" ? m.fileCount : m?.files?.length ?? 0;
  const copies = typeof m?.pluginCopyCount === "number" ? m.pluginCopyCount : (m?.plugins ?? []).filter((p) => p.hasCopy || p.fallbackBundle || p.bundledSource).length;
  return { files, copies };
}
function BackupSummary({ result, location }) {
  const tr = useT();
  const { files, copies } = backupCounts(result);
  const parts = [
    tr("summary.backup.files", { files }),
    formatBytes(result.bytes),
    tr("summary.backup.copies", { copies })
  ];
  if (result.encrypted) parts.push(tr("common.encrypted"));
  const took = result.durationMs !== void 0 ? `\uFF0C${tr("summary.took", { time: formatDuration(result.durationMs) })}` : "";
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(Banner, { tone: "ok", role: "status", title: `${tr("summary.backup.ok")}\uFF1A${parts.join(" \xB7 ")}${took}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dv-hint", children: tr("summary.backup.savedTo", { location }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dv-hint dv-mono", children: result.snapshotId })
  ] });
}

// src/client/components/PluginCopiesCard.tsx
var import_react5 = require("react");
var import_jsx_runtime6 = require("react/jsx-runtime");
function PluginCopiesCard({ api }) {
  const tr = useT();
  const [plugins, setPlugins] = (0, import_react5.useState)(null);
  const [enabled, setEnabled] = (0, import_react5.useState)(true);
  const [exclude, setExclude] = (0, import_react5.useState)(/* @__PURE__ */ new Set());
  const [order, setOrder] = (0, import_react5.useState)("source-first");
  const [checking, setChecking] = (0, import_react5.useState)(false);
  const [error, setError] = (0, import_react5.useState)(null);
  (0, import_react5.useEffect)(() => {
    let alive = true;
    api.listPlugins(false).then((r) => {
      if (!alive) return;
      setPlugins(r.plugins);
      setEnabled(r.settings?.enabled !== false);
      setExclude(new Set(r.settings?.exclude ?? []));
      setOrder(r.restoreOrder ?? "source-first");
      setChecking(true);
      return api.listPlugins(true).then((full) => {
        if (alive) setPlugins(full.plugins);
      });
    }).catch((e) => {
      if (alive) setError(e instanceof Error ? e.message : String(e));
    }).finally(() => {
      if (alive) setChecking(false);
    });
    return () => {
      alive = false;
    };
  }, [api]);
  const save = (patch) => {
    api.updateSettings(patch).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  const setCopies = (nextEnabled, nextExclude) => {
    setEnabled(nextEnabled);
    setExclude(nextExclude);
    save({ pluginCopies: { enabled: nextEnabled, exclude: [...nextExclude].sort() } });
  };
  const toggle = (key) => {
    const next = new Set(exclude);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCopies(enabled, next);
  };
  const selected = (0, import_react5.useMemo)(() => (plugins ?? []).filter((p) => !exclude.has(p.key)).length, [plugins, exclude]);
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(Card, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      CardHead,
      {
        title: tr("copies.title"),
        sub: tr("copies.desc"),
        actions: enabled && plugins?.length ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dv-small dv-muted dv-num", children: tr("backup.scopeSummary", { selected, total: plugins.length }) }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Button, { size: "sm", variant: "quiet", onClick: () => setCopies(true, /* @__PURE__ */ new Set()), children: tr("backup.scopeAll") }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Button, { size: "sm", variant: "quiet", onClick: () => setCopies(true, new Set(plugins.map((p) => p.key))), children: tr("backup.scopeNone") })
        ] }) : null
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dv-card-sep", "aria-hidden": "true" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(Rows, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        SettingRow,
        {
          title: tr("copies.enable"),
          description: tr("copies.enableDesc"),
          htmlFor: "dv-copies-enable",
          control: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Switch, { id: "dv-copies-enable", checked: enabled, onChange: () => setCopies(!enabled, exclude) })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(SettingRow, { title: tr("copies.order"), description: tr("copies.orderDesc"), htmlFor: "dv-copies-order", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
        Select,
        {
          id: "dv-copies-order",
          value: order,
          onChange: (e) => {
            const v = e.target.value === "copy-first" ? "copy-first" : "source-first";
            setOrder(v);
            save({ pluginRestoreOrder: v });
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "source-first", children: tr("copies.order.source-first") }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "copy-first", children: tr("copies.order.copy-first") })
          ]
        }
      ) })
    ] }),
    error ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dv-hint", style: { color: "var(--dv-danger)" }, children: error }) : null,
    enabled ? plugins === null ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(LoadingInline, { label: tr("copies.loading") }) : plugins.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "dv-hint", children: tr("copies.none") }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dv-card-list", style: { gap: 6 }, children: [
      checking ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dv-small dv-muted", children: tr("copies.checking") }) : null,
      plugins.map((p) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        Checkbox,
        {
          id: `dv-copy-${p.key}`,
          checked: !exclude.has(p.key),
          onChange: () => toggle(p.key),
          title: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dv-mono", children: p.name }),
            p.version ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "dv-muted dv-num", children: [
              " @",
              p.version
            ] }) : null,
            " ",
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Tag, { children: p.profile }),
            " ",
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Tag, { children: tr(`copies.kind.${p.kind}`) }),
            p.recommended ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
              " ",
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Tag, { tone: "warn", children: tr("copies.recommended") })
            ] }) : null
          ] }),
          description: p.kind === "local" ? tr("copies.hint.local") : p.registry === "missing" ? tr("copies.hint.missing", { version: p.version ?? "" }) : p.cordisOnly ? tr("copies.hint.cordisOnly") : void 0
        },
        p.key
      ))
    ] }) : null
  ] });
}

// src/client/components/BackupPanel.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
var CATEGORIES = [
  { id: "plugins", label: "backup.cat.plugins", desc: "backup.cat.plugins.desc" },
  { id: "plugin-config", label: "backup.cat.plugin-config", desc: "backup.cat.plugin-config.desc" },
  { id: "mcp", label: "backup.cat.mcp", desc: "backup.cat.mcp.desc" },
  { id: "skills", label: "backup.cat.skills", desc: "backup.cat.skills.desc" },
  { id: "settings", label: "backup.cat.settings", desc: "backup.cat.settings.desc" },
  { id: "providers", label: "backup.cat.providers", desc: "backup.cat.providers.desc" },
  { id: "agent-presets", label: "backup.cat.agent-presets", desc: "backup.cat.agent-presets.desc" },
  { id: "profiles", label: "backup.cat.profiles", desc: "backup.cat.profiles.desc" },
  { id: "instructions", label: "backup.cat.instructions", desc: "backup.cat.instructions.desc" },
  { id: "plugin-data", label: "backup.cat.plugin-data", desc: "backup.cat.plugin-data.desc" },
  { id: "credentials", label: "backup.cat.credentials", desc: "backup.cat.credentials.desc", secret: true }
];
var ALL_IDS = CATEGORIES.map((c) => c.id);
function defaultExportName(encrypt, now = /* @__PURE__ */ new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `dsh-vault-${stamp}.${encrypt ? "dshvault" : "tar.gz"}`;
}
function strengthLabel(tr, level) {
  return tr(`backup.strength.${level}`);
}
function BackupPanel({
  targets,
  busy,
  message,
  error,
  progress,
  onBackup,
  defaultTargetId,
  stage,
  onNavigateStorage,
  fs,
  pluginDataEntries,
  copiesApi,
  result,
  resultLocation
}) {
  const tr = useT();
  const [destMode, setDestMode] = (0, import_react6.useState)(targets.length ? "target" : "directory");
  const destTouched = (0, import_react6.useRef)(false);
  (0, import_react6.useEffect)(() => {
    if (!destTouched.current && targets.length > 0) setDestMode("target");
  }, [targets.length]);
  const [targetId, setTargetId] = (0, import_react6.useState)(defaultTargetId ?? targets[0]?.id ?? "");
  const [directory, setDirectory] = (0, import_react6.useState)("");
  const [exportFile, setExportFile] = (0, import_react6.useState)("");
  const [encrypt, setEncrypt] = (0, import_react6.useState)(false);
  const [includeSecrets, setIncludeSecrets] = (0, import_react6.useState)(false);
  const [password, setPassword] = (0, import_react6.useState)("");
  const [notes, setNotes] = (0, import_react6.useState)("");
  const [scope, setScope] = (0, import_react6.useState)(() => new Set(ALL_IDS));
  const [touched, setTouched] = (0, import_react6.useState)(false);
  const [picker, setPicker] = (0, import_react6.useState)(null);
  (0, import_react6.useEffect)(() => {
    if (!targetId || !targets.some((t) => t.id === targetId)) {
      const next = (defaultTargetId && targets.some((t) => t.id === defaultTargetId) ? defaultTargetId : targets[0]?.id) ?? "";
      setTargetId(next);
    }
  }, [targets, targetId, defaultTargetId]);
  const target = targets.find((t) => t.id === targetId);
  (0, import_react6.useEffect)(() => {
    if (target?.encryptByDefault) setEncrypt(true);
  }, [target?.id, target?.encryptByDefault]);
  const strength = passwordStrength(password);
  const selectedCats = CATEGORIES.filter((c) => scope.has(c.id) && (!c.secret || encrypt));
  const noScope = selectedCats.length === 0;
  const passwordMissing = encrypt && password.length === 0;
  const destOk = destMode === "target" ? Boolean(targetId) : destMode === "directory" ? Boolean(directory.trim()) : Boolean(exportFile.trim());
  const canSubmit = destOk && !noScope && !passwordMissing && !busy;
  const toggleCategory = (id) => {
    setScope((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const progressLabel = (0, import_react6.useMemo)(
    () => stage ? tr("backup.progressStage", { stage: tr(`backup.progress.${stage}`) }) : tr("backup.progress"),
    [tr, stage]
  );
  const submit = () => {
    setTouched(true);
    if (!canSubmit) return;
    onBackup({
      targetId: destMode === "target" ? targetId : void 0,
      directory: destMode === "directory" ? directory.trim() : void 0,
      exportFile: destMode === "file" ? exportFile.trim() : void 0,
      encrypt,
      password: encrypt ? password : void 0,
      includeSecrets: includeSecrets && encrypt,
      notes: notes.trim() || void 0,
      categories: selectedCats.length === CATEGORIES.length ? void 0 : selectedCats.map((c) => c.id)
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dv-section-desc", children: tr("backup.desc") }),
    error ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Banner, { tone: "error", title: tr("backup.failedTitle"), children: error }) : null,
    result ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(BackupSummary, { result, location: resultLocation ?? "" }) : null,
    message ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Banner, { tone: "ok", children: message }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(Card, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(CardHead, { title: tr("backup.targetTitle"), sub: tr("backup.targetDesc") }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dv-card-sep", "aria-hidden": "true" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Rows, { children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(SettingRow, { title: tr("backup.destMode"), description: tr("backup.destModeDesc"), children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("select", { className: "dv-input", value: destMode, onChange: (e) => {
        destTouched.current = true;
        setDestMode(e.target.value);
      }, "aria-label": tr("backup.destMode"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "target", children: tr("backup.dest.target") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "directory", children: tr("backup.dest.directory") }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "file", children: tr("backup.dest.file") })
      ] }) }) }),
      destMode === "target" ? targets.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        EmptyState,
        {
          title: tr("backup.noTargetsTitle"),
          body: tr("backup.noTargetsBody"),
          actions: onNavigateStorage ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Button, { variant: "primary", onClick: onNavigateStorage, children: tr("backup.goStorage") }) : null
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dv-options", role: "radiogroup", "aria-label": tr("backup.targetTitle"), children: targets.map((tg) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        OptionTile,
        {
          name: "dv-backup-target",
          checked: tg.id === targetId,
          onChange: () => setTargetId(tg.id),
          title: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
            targetName(tg, tr),
            tg.encryptByDefault ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Tag, { tone: "ok", children: tr("backup.targetEncBadge") }) : null
          ] }),
          description: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
            targetKindLabel(tg, tr),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("br", {}),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "dv-mono", children: targetLocation(tg) })
          ] })
        },
        tg.id
      )) }) : null,
      destMode === "directory" ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Field, { label: tr("backup.directory"), htmlFor: "dv-backup-dir", hint: tr("backup.directoryHint"), children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(TextInput, { id: "dv-backup-dir", value: directory, onChange: (e) => setDirectory(e.target.value), placeholder: tr("backup.directoryPlaceholder"), mono: true }),
        fs ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Button, { variant: "quiet", onClick: () => setPicker("directory"), children: tr("backup.browse") }) : null
      ] }) }) : null,
      destMode === "file" ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Field, { label: tr("backup.exportFile"), htmlFor: "dv-backup-file", hint: tr("backup.exportFileHint"), children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(TextInput, { id: "dv-backup-file", value: exportFile, onChange: (e) => setExportFile(e.target.value), placeholder: tr("backup.exportFilePlaceholder"), mono: true }),
        fs ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Button, { variant: "quiet", onClick: () => setPicker("save"), children: tr("backup.browse") }) : null
      ] }) }) : null,
      fs ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        PathPicker,
        {
          open: picker !== null,
          mode: picker ?? "directory",
          fs,
          initialPath: picker === "save" ? exportFile : directory,
          defaultFileName: defaultExportName(encrypt),
          onClose: () => setPicker(null),
          onSelect: (p) => {
            if (picker === "save") setExportFile(p);
            else setDirectory(p);
            setPicker(null);
          }
        }
      ) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(Card, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        CardHead,
        {
          title: tr("backup.scopeTitle"),
          sub: tr("backup.scopeDesc"),
          actions: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "dv-small dv-muted dv-num", children: tr("backup.scopeSummary", { selected: selectedCats.length, total: CATEGORIES.length }) }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Button, { size: "sm", variant: "quiet", onClick: () => setScope(new Set(ALL_IDS)), children: tr("backup.scopeAll") }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Button, { size: "sm", variant: "quiet", onClick: () => setScope(/* @__PURE__ */ new Set()), children: tr("backup.scopeNone") })
          ] })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dv-card-sep", "aria-hidden": "true" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dv-card-list", style: { gap: 6 }, children: CATEGORIES.map((c) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        OptionTile,
        {
          shape: "square",
          checked: scope.has(c.id) && (!c.secret || encrypt),
          disabled: Boolean(c.secret) && !encrypt,
          onChange: () => toggleCategory(c.id),
          title: tr(c.label),
          description: c.id === "plugin-data" && pluginDataEntries ? pluginDataEntries.length ? tr("backup.cat.plugin-data.found", { list: pluginDataEntries.join("  ") }) : tr("backup.cat.plugin-data.none") : c.secret && !encrypt ? tr("backup.cat.credentials.plainBlocked") : tr(c.desc)
        },
        c.id
      )) })
    ] }),
    copiesApi && (scope.has("plugins") || scope.has("profiles")) ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(PluginCopiesCard, { api: copiesApi }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(Rows, { label: tr("backup.encTitle"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        SettingRow,
        {
          title: tr("backup.encTitle"),
          description: tr("backup.encDesc"),
          htmlFor: "dv-backup-encrypt",
          control: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            Switch,
            {
              id: "dv-backup-encrypt",
              checked: encrypt,
              onChange: () => {
                const next = !encrypt;
                setEncrypt(next);
                if (!next) {
                  setIncludeSecrets(false);
                  setScope((prev) => {
                    const copy = new Set(prev);
                    copy.delete("credentials");
                    return copy;
                  });
                }
              }
            }
          )
        }
      ),
      encrypt ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        SettingRow,
        {
          stacked: true,
          title: tr("backup.password"),
          description: touched && passwordMissing ? tr("backup.passwordRequired") : tr("backup.passwordHint"),
          htmlFor: "dv-backup-password",
          children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            Field,
            {
              label: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "dv-sr-only", children: tr("backup.password") }),
              htmlFor: "dv-backup-password",
              hint: password ? tr("backup.strength", { level: strengthLabel(tr, strength.level) }) : void 0,
              children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                PasswordInput,
                {
                  id: "dv-backup-password",
                  value: password,
                  autoComplete: "new-password",
                  placeholder: tr("backup.passwordPlaceholder"),
                  onChange: (e) => setPassword(e.target.value)
                }
              )
            }
          )
        }
      ) : null,
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        SettingRow,
        {
          title: tr("backup.secretsTitle"),
          description: encrypt ? tr("backup.secretsDesc") : tr("backup.secretsBlocked"),
          htmlFor: "dv-backup-secrets",
          control: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            Switch,
            {
              id: "dv-backup-secrets",
              checked: includeSecrets && encrypt,
              disabled: !encrypt,
              onChange: () => {
                const next = !includeSecrets;
                setIncludeSecrets(next);
                if (next) setScope((prev) => new Set(prev).add("credentials"));
              }
            }
          )
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(SettingRow, { title: tr("backup.notes"), htmlFor: "dv-backup-notes", control: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { style: { width: 220, maxWidth: "100%" }, children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        TextInput,
        {
          id: "dv-backup-notes",
          value: notes,
          maxLength: 200,
          placeholder: tr("backup.notesPlaceholder"),
          onChange: (e) => setNotes(e.target.value)
        }
      ) }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dv-card-foot", style: { justifyContent: "space-between" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "dv-hint", style: { color: noScope ? "var(--dv-danger)" : void 0 }, children: noScope ? tr("backup.noScope") : "" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Button, { variant: "primary", onClick: submit, loading: busy, children: busy ? tr("backup.submitting") : tr("backup.submit") })
    ] })
  ] });
}

// src/client/components/JobProgress.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
function JobProgress({ job }) {
  const tr = useT();
  const p = job.progress;
  const stage = tr(`job.stage.${job.kind === "backup" ? "backup" : "restore"}.${p.stage}`);
  const title = tr(`job.title.${job.kind}`);
  const count = p.total ? ` (${p.current ?? 0}/${p.total})` : "";
  const detail = /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
    p.item ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dv-mono", style: { overflowWrap: "anywhere" }, children: p.item }) : null,
    p.item ? " \xB7 " : null,
    tr("job.elapsed", { time: formatDuration(job.elapsedMs) })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dv-job", role: "status", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(ProgressBar, { value: p.percent, label: `${title} \xB7 ${stage}${count}`, detail }) });
}

// src/client/components/RestorePanel.tsx
var import_react8 = require("react");

// src/client/lib/requests.ts
function buildRestoreRequest(s) {
  const approved = Object.entries(s.approvedSources).filter(([, v]) => v).map(([k]) => k);
  return {
    targetId: s.usingImport ? void 0 : s.targetId,
    snapshotId: s.usingImport ? void 0 : s.snapshotId,
    importPath: s.usingImport ? s.importPath.trim() : void 0,
    password: s.password || void 0,
    conflict: s.conflict,
    conflicts: s.conflicts,
    createRollbackSnapshot: s.rollback,
    reinstallPlugins: s.reinstall,
    includeSecrets: Boolean(s.secretsAvailable && s.withSecrets),
    // Only meaningful when plugins are reinstalled.
    approvedPluginSources: s.reinstall ? approved : []
  };
}

// src/client/components/DiffGroups.tsx
var import_react7 = require("react");
var import_jsx_runtime9 = require("react/jsx-runtime");
var ORDER = [
  "plugins",
  "profiles",
  "mcp",
  "skills",
  "settings",
  "providers",
  "agent-presets",
  "instructions",
  "plugin-config",
  "plugin-data",
  "credentials"
];
var CHANGES = ["add", "change", "remove", "unchanged"];
var GROUP_PAGE = 50;
function groupDiffItems(items, opts) {
  const q = opts.query.trim().toLowerCase();
  const by = /* @__PURE__ */ new Map();
  for (const i of items) {
    if (q && !i.path.toLowerCase().includes(q)) continue;
    const id = ORDER.includes(i.category) ? i.category : "other";
    let g = by.get(id);
    if (!g) {
      g = { id, items: [], counts: { add: 0, change: 0, remove: 0, unchanged: 0 } };
      by.set(id, g);
    }
    g.counts[i.change]++;
    if (i.change === "unchanged" && !opts.showUnchanged) continue;
    g.items.push(i);
  }
  const rank = { add: 0, change: 1, remove: 2, unchanged: 3 };
  const out = [...by.values()];
  for (const g of out) g.items.sort((a, b) => rank[a.change] - rank[b.change] || a.path.localeCompare(b.path));
  return out.filter((g) => g.items.length > 0 || opts.showUnchanged).sort((a, b) => (ORDER.indexOf(a.id) + 1 || 99) - (ORDER.indexOf(b.id) + 1 || 99));
}
function DiffGroups({
  items,
  renderOutcome
}) {
  const tr = useT();
  const [query, setQuery] = (0, import_react7.useState)("");
  const [showUnchanged, setShowUnchanged] = (0, import_react7.useState)(false);
  const [open, setOpen] = (0, import_react7.useState)(/* @__PURE__ */ new Set());
  const [limit, setLimit] = (0, import_react7.useState)({});
  const groups = (0, import_react7.useMemo)(() => groupDiffItems(items, { showUnchanged, query }), [items, showUnchanged, query]);
  const hiddenUnchanged = showUnchanged ? 0 : items.filter((i) => i.change === "unchanged").length;
  const searching = query.trim().length > 0;
  const label = (id) => id === "other" ? tr("restore.group.other") : tr(`backup.cat.${id}`);
  const toggle = (id) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const countsText = (g) => CHANGES.filter((c) => g.counts[c] > 0).map((c) => `${tr(`restore.filter.${c}`)} ${g.counts[c]}`).join(" \xB7 ");
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dv-diff-groups", children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dv-diff-toolbar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: { flex: "1 1 180px", maxWidth: 260 }, children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(SearchInput, { value: query, onChange: setQuery, placeholder: tr("restore.diffSearch"), label: tr("restore.diffSearch") }) }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("label", { className: "dv-small dv-muted dv-diff-toggle", htmlFor: "dv-diff-unchanged", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Switch, { id: "dv-diff-unchanged", checked: showUnchanged, onChange: () => setShowUnchanged(!showUnchanged) }),
        tr("restore.showUnchanged")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: { flex: 1 } }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Button, { size: "sm", variant: "quiet", onClick: () => setOpen(new Set(groups.map((g) => g.id))), children: tr("restore.expandAll") }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Button, { size: "sm", variant: "quiet", onClick: () => setOpen(/* @__PURE__ */ new Set()), children: tr("restore.collapseAll") })
    ] }),
    groups.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dv-hint", children: searching ? tr("restore.diffNoMatch") : tr("restore.diffOnlyUnchanged", { count: hiddenUnchanged }) }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("ul", { className: "dv-diff-list", children: groups.map((g) => {
      const isOpen = open.has(g.id) || searching;
      const max = limit[g.id] ?? GROUP_PAGE;
      return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("li", { className: "dv-diff-group", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("button", { type: "button", className: "dv-diff-head", "aria-expanded": isOpen, onClick: () => toggle(g.id), children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dv-diff-chevron", "aria-hidden": "true", children: isOpen ? "\u25BE" : "\u25B8" }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dv-diff-title", children: label(g.id) }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dv-small dv-muted dv-num", children: countsText(g) })
        ] }),
        isOpen ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dv-diff-body", children: [
          g.items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dv-hint", children: tr("restore.diffGroupAllSame") }) : null,
          g.items.slice(0, max).map((i) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "dv-diff-row", "data-change": i.change, children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dv-diff-badge", children: tr(`restore.filter.${i.change}`) }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dv-path dv-mono", children: i.path }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dv-small", children: renderOutcome(i) })
          ] }, `${i.change}:${i.path}`)),
          g.items.length > max ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Button, { size: "sm", variant: "quiet", onClick: () => setLimit((p) => ({ ...p, [g.id]: max + GROUP_PAGE * 4 })), children: tr("restore.showMore", { count: g.items.length - max }) }) : null
        ] }) : null
      ] }, g.id);
    }) }),
    hiddenUnchanged > 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "dv-hint", children: tr("restore.unchangedHidden", { count: hiddenUnchanged }) }) : null
  ] });
}

// src/client/components/RestorePanel.tsx
var import_jsx_runtime10 = require("react/jsx-runtime");
var ROLLBACK_TARGET_ID = "local-rollback";
var MAX_ROWS = 200;
var DEFAULT_CONFLICT = "use-backup";
function sameConflicts(a, b) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}
function outcomeOf(item, strategy) {
  if (item.change === "add") return "apply";
  if (item.change === "change") return strategy === "use-backup" ? "apply" : "skip";
  return "noop";
}
function changeLabel(tr, change) {
  switch (change) {
    case "add":
      return tr("restore.added");
    case "change":
      return tr("restore.changed");
    case "remove":
      return tr("restore.removed");
    default:
      return tr("restore.unchanged");
  }
}
function strategyLabel(tr, strategy) {
  return strategy === "use-backup" ? tr("restore.useBackup") : tr("restore.keepCurrent");
}
function RestorePanel({
  targets,
  snapshots,
  preview,
  archiveLimitBytes,
  onSourceChange,
  busy,
  message,
  error,
  onPreview,
  onRestore,
  loading,
  initialTargetId,
  initialSnapshotId,
  onNavigateStorage,
  fs,
  result,
  onRetryFailed,
  retrying
}) {
  const tr = useT();
  const locale = useLocale();
  const groupId = (0, import_react8.useId)();
  const [pickerOpen, setPickerOpen] = (0, import_react8.useState)(false);
  const topRef = (0, import_react8.useRef)(null);
  (0, import_react8.useEffect)(() => {
    if (result || message || error) topRef.current?.scrollIntoView?.({ block: "start" });
  }, [result, message, error]);
  const [sourceMode, setSourceMode] = (0, import_react8.useState)(
    initialTargetId || initialSnapshotId || snapshots.length ? "target" : "import"
  );
  const [targetId, setTargetId] = (0, import_react8.useState)(initialTargetId ?? "");
  const [snapshotId, setSnapshotId] = (0, import_react8.useState)(initialSnapshotId ?? "");
  const [importPath, setImportPath] = (0, import_react8.useState)("");
  const [search, setSearch] = (0, import_react8.useState)("");
  const [password, setPassword] = (0, import_react8.useState)("");
  const [showPasswordError, setShowPasswordError] = (0, import_react8.useState)(false);
  const [ack, setAck] = (0, import_react8.useState)(false);
  const [rollback, setRollback] = (0, import_react8.useState)(true);
  const [reinstall, setReinstall] = (0, import_react8.useState)(true);
  const [withSecrets, setWithSecrets] = (0, import_react8.useState)(true);
  const [approvedSources, setApprovedSources] = (0, import_react8.useState)({});
  const [dialogOpen, setDialogOpen] = (0, import_react8.useState)(false);
  const [choices, setChoices] = (0, import_react8.useState)({});
  const [diffFilter, setDiffFilter] = (0, import_react8.useState)("all");
  const targetLabel = (id) => targetName(targets.find((t) => t.id === id), tr, id);
  const usingImport = sourceMode === "import";
  const filterInit = (0, import_react8.useRef)(false);
  (0, import_react8.useEffect)(() => {
    if (usingImport || !snapshots.length) return;
    if (filterInit.current && (targetId === "" || snapshots.some((s) => s.targetId === targetId))) return;
    filterInit.current = true;
    const has = (id) => Boolean(id) && snapshots.some((s) => s.targetId === id);
    const realFirst = [...snapshots].sort(newestFirst).find((s) => s.targetId !== ROLLBACK_TARGET_ID);
    setTargetId(has(initialTargetId) ? initialTargetId : realFirst?.targetId ?? "");
  }, [snapshots, targetId, initialTargetId, usingImport]);
  const extraTargetIds = (0, import_react8.useMemo)(
    () => [...new Set(snapshots.map((s) => s.targetId))].filter((id) => !targets.some((t) => t.id === id)),
    [snapshots, targets]
  );
  const filtered = (0, import_react8.useMemo)(() => {
    const q = search.trim().toLowerCase();
    return snapshots.filter((s) => !targetId || s.targetId === targetId).filter((s) => !q || s.id.toLowerCase().includes(q) || (s.notes ?? "").toLowerCase().includes(q)).sort(newestFirst);
  }, [snapshots, targetId, search]);
  (0, import_react8.useEffect)(() => {
    if (usingImport) return;
    if (snapshotId && filtered.some((s) => s.id === snapshotId)) return;
    setSnapshotId(filtered[0]?.id ?? "");
  }, [filtered, snapshotId, usingImport]);
  const selected = usingImport ? null : snapshots.find((s) => s.id === snapshotId && (!targetId || s.targetId === targetId)) ?? snapshots.find((s) => s.id === snapshotId);
  const needsPassword = usingImport ? false : Boolean(selected?.encrypted);
  const showPasswordField = usingImport || needsPassword;
  const canStartPreview = usingImport ? Boolean(importPath.trim()) : Boolean(selected);
  const previewKey = preview ? `${preview.snapshotId}:${preview.added}:${preview.changed}:${preview.removed}` : null;
  (0, import_react8.useEffect)(() => {
    setChoices({});
    setAck(false);
    setDiffFilter("all");
    const next = {};
    for (const r of preview?.remotePluginSources ?? []) next[r.key] = !usingImport && r.trusted !== false;
    setApprovedSources(next);
  }, [previewKey]);
  const changes = (0, import_react8.useMemo)(
    () => preview ? preview.items.filter((i) => i.change === "add" || i.change === "change") : [],
    [preview]
  );
  const choiceFor = (path) => choices[path] ?? DEFAULT_CONFLICT;
  const setChoice = (path, value) => setChoices((prev) => ({ ...prev, [path]: value }));
  const setAll = (value) => {
    const next = {};
    for (const c of changes) next[c.path] = value;
    setChoices(next);
  };
  const keepCount = changes.filter((c) => choiceFor(c.path) === "keep-current").length;
  const useCount = changes.length - keepCount;
  const requestedConflict = preview?.conflict ?? DEFAULT_CONFLICT;
  const requestedConflicts = (0, import_react8.useMemo)(() => preview?.conflicts ?? {}, [preview]);
  (0, import_react8.useEffect)(() => {
    if (!preview || busy) return;
    if (sameConflicts(choices, requestedConflicts)) return;
    const timer = setTimeout(() => {
      onPreview({
        targetId: usingImport ? void 0 : selected?.targetId,
        snapshotId: usingImport ? void 0 : preview.snapshotId,
        importPath: usingImport ? importPath.trim() : void 0,
        password: password || void 0,
        conflict: requestedConflict,
        conflicts: choices
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [preview, busy, choices, requestedConflicts, onPreview, selected, password, requestedConflict, usingImport, importPath]);
  const applyCount = changes.filter((c) => outcomeOf(c, c.resolution ?? choiceFor(c.path)) === "apply").length;
  function startPreview() {
    setAck(false);
    setShowPasswordError(false);
    if (!canStartPreview) return;
    if (needsPassword && !password) {
      setShowPasswordError(true);
      return;
    }
    onPreview({
      targetId: usingImport ? void 0 : selected?.targetId,
      snapshotId: usingImport ? void 0 : selected?.id,
      importPath: usingImport ? importPath.trim() : void 0,
      password: password || void 0,
      conflict: DEFAULT_CONFLICT,
      conflicts: choices
    });
  }
  function submitRestore() {
    if (!preview) return;
    if (!ack) return;
    onRestore(buildRestoreRequest({
      usingImport,
      targetId: selected?.targetId,
      snapshotId: preview.snapshotId,
      importPath,
      password,
      conflict: requestedConflict,
      conflicts: choices,
      rollback,
      reinstall,
      withSecrets,
      secretsAvailable: Boolean(preview.secretsAvailable),
      approvedSources
    }));
  }
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dv-section-desc", ref: topRef, children: tr("restore.desc") }),
    error ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Banner, { tone: "error", title: tr("restore.failedTitle"), children: error }) : null,
    result ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(RestoreSummary, { result, onRetry: onRetryFailed, retrying }) : message ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(Banner, { tone: "ok", title: tr("restore.successTitle"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { children: message }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dv-hint", children: tr("restore.restartHint") })
    ] }) : null,
    result?.pluginResults?.length ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Collapsible, { summary: tr("restore.resultTitle"), defaultOpen: false, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(PluginResults, { result }) }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(Card, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(CardHead, { title: tr("restore.sourceTitle"), sub: tr("restore.sourceDesc") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dv-card-sep", "aria-hidden": "true" }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Rows, { children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(SettingRow, { title: tr("restore.sourceMode"), description: tr("restore.sourceModeDesc"), children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
        "select",
        {
          className: "dv-input",
          value: sourceMode,
          onChange: (e) => {
            setSourceMode(e.target.value);
            setAck(false);
            onSourceChange?.();
          },
          "aria-label": tr("restore.sourceMode"),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "target", children: tr("restore.source.target") }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "import", children: tr("restore.source.import") })
          ]
        }
      ) }) }),
      usingImport ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(Field, { label: tr("restore.importPath"), htmlFor: "dv-restore-import", hint: tr("restore.importPathHint") + (archiveLimitBytes ? " " + tr("restore.archiveLimit", { size: formatBytes(archiveLimitBytes) }) : ""), children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            TextInput,
            {
              id: "dv-restore-import",
              value: importPath,
              onChange: (e) => setImportPath(e.target.value),
              placeholder: tr("restore.importPathPlaceholder"),
              mono: true
            }
          ),
          fs ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button, { variant: "quiet", onClick: () => setPickerOpen(true), children: tr("restore.browse") }) : null
        ] }),
        fs ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          PathPicker,
          {
            open: pickerOpen,
            mode: "open",
            fs,
            initialPath: importPath,
            onClose: () => setPickerOpen(false),
            onSelect: (p) => {
              setImportPath(p);
              setAck(false);
              setPickerOpen(false);
            }
          }
        ) : null
      ] }) : targets.length === 0 && snapshots.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        EmptyState,
        {
          title: tr("restore.noTargetsTitle"),
          body: tr("restore.noTargetsBody"),
          actions: onNavigateStorage ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button, { variant: "primary", onClick: onNavigateStorage, children: tr("backup.goStorage") }) : null
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
            Select,
            {
              "aria-label": tr("restore.filterTarget"),
              value: targetId,
              onChange: (e) => setTargetId(e.target.value),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: "", children: tr("common.allTargets") }),
                targets.map((t) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: t.id, children: targetName(t, tr) }, t.id)),
                extraTargetIds.map((id) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("option", { value: id, children: id === ROLLBACK_TARGET_ID ? tr("restore.rollbackTarget") : id }, id))
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { style: { width: 180 }, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(SearchInput, { value: search, onChange: setSearch, placeholder: tr("restore.search"), label: tr("restore.search") }) })
        ] }),
        loading && snapshots.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(LoadingInline, { label: tr("app.loading") }) : filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          EmptyState,
          {
            title: snapshots.length === 0 ? tr("restore.emptyTitle") : tr("restore.noMatch"),
            body: snapshots.length === 0 ? tr("restore.emptyBody") : void 0
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dv-options", role: "radiogroup", "aria-label": tr("restore.select"), style: { maxHeight: 320, overflowY: "auto" }, children: filtered.slice(0, 50).map((s) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          OptionTile,
          {
            name: `${groupId}-snapshot`,
            checked: s.id === snapshotId && (!targetId || s.targetId === targetId),
            onChange: () => {
              setSnapshotId(s.id);
              setAck(false);
            },
            title: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dv-mono", children: s.id }),
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Tag, { tone: s.encrypted ? "ok" : "neutral", children: s.encrypted ? tr("common.encrypted") : tr("common.plaintext") }),
              s.includeSecrets ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Tag, { tone: "warn", children: tr("common.secrets") }) : null
            ] }),
            description: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
              targetLabel(s.targetId),
              " \xB7 ",
              formatDateTime(s.createdAt, locale),
              "\uFF08",
              relativeLabel(tr, s.createdAt),
              "\uFF09 \xB7 ",
              formatBytes(s.bytes),
              s.notes ? ` \xB7 ${s.notes}` : ""
            ] })
          },
          `${s.targetId}:${s.id}`
        )) })
      ] }),
      showPasswordField ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        Field,
        {
          label: tr("restore.password"),
          htmlFor: "dv-restore-password",
          hint: usingImport ? tr("restore.importPasswordHint") : tr("restore.passwordHint"),
          error: showPasswordError && !password ? tr("restore.passwordRequired") : null,
          children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            PasswordInput,
            {
              id: "dv-restore-password",
              value: password,
              onChange: (e) => setPassword(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") startPreview();
              }
            }
          )
        }
      ) : null,
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dv-card-foot", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button, { variant: "primary", onClick: startPreview, disabled: !canStartPreview || busy, loading: busy && !preview, children: busy && !preview ? tr("restore.previewing") : tr("restore.preview") }) })
    ] }),
    preview?.crossPlatform ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(Banner, { tone: "warn", title: tr("restore.crossPlatformTitle"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { children: tr("restore.crossPlatformDesc", { source: preview.sourcePlatform ?? "?", target: preview.targetPlatform ?? "?" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dv-hint", style: { marginTop: 6 }, children: tr("restore.crossPlatformLocalSources") })
    ] }) : null,
    preview ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(Card, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        CardHead,
        {
          title: tr("restore.diffTitle"),
          sub: tr("restore.diffDesc", {
            added: preview.added,
            changed: preview.changed,
            removed: preview.removed,
            unchanged: preview.unchanged
          })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dv-card-sep", "aria-hidden": "true" }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dv-card-sub dv-mono", children: preview.snapshotId }),
      preview.items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dv-hint", children: tr("restore.diffEmpty") }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        DiffGroups,
        {
          items: preview.items,
          renderOutcome: (i) => {
            if (i.change !== "add" && i.change !== "change") return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dv-muted", children: tr("restore.noChange") });
            const strategy = i.resolution ?? choiceFor(i.path);
            const outcome = outcomeOf(i, strategy);
            return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: outcome === "skip" ? "dv-muted" : void 0, children: [
              strategyLabel(tr, strategy),
              " \xB7 ",
              outcome === "skip" ? tr("restore.willSkip") : tr("restore.willApply")
            ] });
          }
        }
      ),
      preview.removed > 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dv-hint", children: tr("restore.removedNote") }) : null
    ] }) : null,
    preview && changes.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(Card, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        CardHead,
        {
          title: tr("restore.conflictTitle"),
          sub: tr("restore.conflictDesc"),
          actions: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dv-hint dv-num", children: tr("restore.conflictsSummary", { use: useCount, keep: keepCount }) }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button, { size: "sm", variant: "quiet", onClick: () => setAll("use-backup"), children: tr("restore.useBackup") }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button, { size: "sm", variant: "quiet", onClick: () => setAll("keep-current"), children: tr("restore.keepCurrent") })
          ] })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dv-card-sep", "aria-hidden": "true" }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { style: { maxHeight: 320, overflowY: "auto" }, children: changes.slice(0, MAX_ROWS).map((c) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dv-conflict-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "dv-conflict-main", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Tag, { children: changeLabel(tr, c.change) }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dv-conflict-path", title: c.path, children: c.path })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("fieldset", { className: "dv-segment", style: { border: 0, margin: 0, padding: 2, flex: "none" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("legend", { className: "dv-sr-only", children: tr("restore.perItem", { path: c.path }) }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "button",
            {
              type: "button",
              "aria-pressed": choiceFor(c.path) === "use-backup",
              onClick: () => setChoice(c.path, "use-backup"),
              children: tr("restore.useBackup")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "button",
            {
              type: "button",
              "aria-pressed": choiceFor(c.path) === "keep-current",
              onClick: () => setChoice(c.path, "keep-current"),
              children: tr("restore.keepCurrent")
            }
          )
        ] })
      ] }, c.path)) }),
      changes.length > MAX_ROWS ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dv-hint", children: tr("restore.truncated", { shown: MAX_ROWS }) }) : null
    ] }) : null,
    preview && preview.pluginsToReinstall.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(Collapsible, { summary: tr("restore.pluginsTitle", { count: preview.pluginsToReinstall.length }), defaultOpen: true, children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { children: tr("restore.pluginsDesc") }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("ul", { style: { margin: "6px 0 0", paddingLeft: 18 }, children: preview.pluginsToReinstall.map((p) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dv-mono", children: p.name }),
        p.version ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "dv-muted", children: [
          "@",
          p.version
        ] }) : null,
        p.profile ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "dv-muted", children: [
          " \xB7 ",
          p.profile
        ] }) : null
      ] }, `${p.profile ?? ""}:${p.name}`)) })
    ] }) : null,
    preview && preview.manualActions.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Banner, { tone: "warn", title: tr("restore.manualTitle"), children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("ul", { children: preview.manualActions.map((m) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("li", { children: localizeNotice(m, tr) }, m)) }) }) : null,
    preview ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(Rows, { label: tr("restore.confirmTitle"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          SettingRow,
          {
            title: tr("restore.confirmTitle"),
            description: tr("restore.confirmDesc"),
            htmlFor: "dv-restore-ack",
            control: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Switch, { id: "dv-restore-ack", checked: ack, onChange: () => setAck((v) => !v) })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          SettingRow,
          {
            title: tr("restore.rollback"),
            htmlFor: "dv-restore-rollback",
            control: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Switch, { id: "dv-restore-rollback", checked: rollback, onChange: () => setRollback((v) => !v) })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          SettingRow,
          {
            title: tr("restore.managePlugins"),
            htmlFor: "dv-restore-reinstall",
            control: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Switch, { id: "dv-restore-reinstall", checked: reinstall, onChange: () => setReinstall((v) => !v) })
          }
        ),
        preview.secretsAvailable ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          SettingRow,
          {
            title: tr("restore.withSecrets"),
            description: tr("restore.withSecretsDesc"),
            htmlFor: "dv-restore-secrets",
            control: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Switch, { id: "dv-restore-secrets", checked: withSecrets, onChange: () => setWithSecrets((v) => !v) })
          }
        ) : null
      ] }),
      reinstall && preview.remotePluginSources?.length ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dv-plugin-sources", role: "group", "aria-label": tr("restore.remoteSourcesTitle"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dv-check-title", children: tr("restore.remoteSourcesTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dv-hint", children: tr(usingImport ? "restore.remoteSourcesImportHint" : "restore.remoteSourcesHint") }),
        preview.remotePluginSources.map((r) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          Checkbox,
          {
            title: `${r.name} (${r.profile})`,
            description: r.trusted === false ? `${r.source} \u2014 ${tr("restore.untrustedSource")}` : r.source,
            checked: Boolean(approvedSources[r.key]),
            onChange: () => setApprovedSources((prev) => ({ ...prev, [r.key]: !prev[r.key] }))
          },
          r.key
        ))
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dv-card-foot", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        Button,
        {
          variant: "danger",
          disabled: !ack || busy,
          onClick: () => {
            if (preview.removed > 0 || preview.changed > 0) setDialogOpen(true);
            else submitRestore();
          },
          children: tr("restore.submit")
        }
      ) }),
      !ack ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dv-hint", children: tr("restore.needConfirm") }) : null
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
      ConfirmDialog,
      {
        open: dialogOpen,
        title: tr("restore.dialogTitle", { id: preview?.snapshotId ?? "" }),
        description: tr("restore.dialogBody", { apply: applyCount, keep: keepCount, removed: preview?.removed ?? 0 }),
        confirmLabel: busy ? tr("restore.submitting") : tr("restore.dialogConfirm"),
        busy,
        onConfirm: () => {
          setDialogOpen(false);
          submitRestore();
        },
        onClose: () => {
          if (!busy) setDialogOpen(false);
        },
        children: busy ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(LoadingInline, { label: tr("restore.submitting") }) : null
      }
    )
  ] });
}
var STATUS_TONE = { installed: "ok", "installed-from-backup": "warn", "already-present": "ok", failed: "danger", skipped: "neutral" };
function PluginResults({
  result,
  onRetry,
  retrying
}) {
  const tr = useT();
  const locale = useLocale();
  const rows = result.pluginResults ?? [];
  const { ok, failed, skipped } = pluginCounts(result);
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(Card, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
      CardHead,
      {
        title: tr("restore.resultTitle"),
        sub: skipped ? tr("restore.resultDescWithSkipped", { ok, failed, skipped }) : tr("restore.resultDesc", { ok, failed }),
        actions: failed && onRetry ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Button, { size: "sm", onClick: onRetry, loading: retrying, disabled: retrying, title: tr("restore.retryDesc"), children: retrying ? tr("restore.retrying") : tr("restore.retryFailed") }) : void 0
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "dv-card-sep", "aria-hidden": "true" }),
    rows.some((r) => r.status === "installed-from-backup") ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "dv-small dv-muted", style: { margin: "0 0 8px", padding: "0 4px" }, children: tr("restore.legend.fromBackup") }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("ul", { className: "dv-list", "aria-label": tr("restore.resultTitle"), children: rows.map((r) => {
      const raw = pluginRawDetail(r, tr);
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("li", { className: "dv-list-item", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dv-list-main", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "dv-list-title dv-mono", children: r.name }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "span",
            {
              className: r.status === "failed" ? "dv-small dv-error-text" : "dv-small dv-muted",
              style: { overflowWrap: "anywhere" },
              children: pluginReasonText(r, tr)
            }
          ),
          raw ? /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("details", { className: "dv-details", children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("summary", { children: tr("restore.details") }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("pre", { className: "dv-log", children: raw })
          ] }) : null
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "dv-list-meta", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Tag, { children: r.profile }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Tag, { tone: STATUS_TONE[r.status], children: tr(`restore.status.${r.status}`) })
        ] })
      ] }, `${r.profile}:${r.name}`);
    }) })
  ] });
}

// src/client/components/StoragePanel.tsx
var import_react9 = require("react");
var import_jsx_runtime11 = require("react/jsx-runtime");
var EMPTY_FORM = {
  kind: "local",
  id: "",
  label: "",
  directory: "",
  owner: "",
  repo: "",
  branch: "",
  pathPrefix: "",
  tokenCredential: "GITHUB_TOKEN",
  token: "",
  url: "",
  username: "",
  password: "",
  endpoint: "",
  region: "",
  bucket: "",
  accessKeyId: "",
  secretAccessKey: "",
  forcePathStyle: true,
  encryptByDefault: false
};
var KINDS = ["local", "github", "webdav", "s3"];
var KIND_LABEL = {
  local: "storage.kind.local",
  github: "storage.kind.github",
  webdav: "storage.kind.webdav",
  s3: "storage.kind.s3"
};
var KIND_ADD = {
  local: "kind.local",
  github: "kind.github",
  webdav: "kind.webdav",
  s3: "kind.s3"
};
function blankIdFor(kind, existing) {
  const base = kind === "local" ? "local" : kind;
  let n = 1;
  let id = `${base}-${n}`;
  while (existing.some((t) => t.id === id)) {
    n += 1;
    id = `${base}-${n}`;
  }
  return id;
}
function formFromTarget(t) {
  const base = {
    ...EMPTY_FORM,
    kind: t.kind,
    id: t.id,
    label: t.label,
    encryptByDefault: Boolean(t.encryptByDefault)
  };
  if (t.kind === "local") {
    return { ...base, directory: t.directory, encryptByDefault: t.encryptByDefault ?? base.encryptByDefault };
  }
  if (t.kind === "github") {
    return {
      ...base,
      owner: t.owner,
      repo: t.repo,
      branch: t.branch ?? "",
      pathPrefix: t.pathPrefix ?? "",
      tokenCredential: t.tokenCredential ?? "GITHUB_TOKEN"
    };
  }
  if (t.kind === "webdav") {
    return { ...base, url: t.url, username: t.username ?? "", pathPrefix: t.pathPrefix ?? "" };
  }
  return {
    ...base,
    endpoint: t.endpoint,
    region: t.region ?? "",
    bucket: t.bucket,
    accessKeyId: t.accessKeyId,
    pathPrefix: t.pathPrefix ?? "",
    forcePathStyle: t.forcePathStyle ?? true
  };
}
function buildTarget(form, existing) {
  const id = form.id.trim();
  const label = form.label.trim() || id;
  const trimOr = (v) => v.trim() ? v.trim() : void 0;
  const encryptByDefault = form.encryptByDefault;
  switch (form.kind) {
    case "local":
      return { kind: "local", id, label, directory: form.directory.trim(), encryptByDefault };
    case "github":
      return {
        kind: "github",
        id,
        label,
        owner: form.owner.trim(),
        repo: form.repo.trim(),
        branch: trimOr(form.branch),
        pathPrefix: trimOr(form.pathPrefix),
        tokenCredential: trimOr(form.tokenCredential),
        token: trimOr(form.token) ?? (existing?.kind === "github" ? existing.token : void 0),
        encryptByDefault
      };
    case "webdav":
      return {
        kind: "webdav",
        id,
        label,
        url: form.url.trim(),
        username: trimOr(form.username),
        // Empty secret fields keep the previously saved value (write-only inputs).
        password: trimOr(form.password) ?? (existing?.kind === "webdav" ? existing.password : void 0),
        pathPrefix: trimOr(form.pathPrefix),
        encryptByDefault
      };
    default:
      return {
        kind: "s3",
        id,
        label,
        endpoint: form.endpoint.trim(),
        region: trimOr(form.region),
        bucket: form.bucket.trim(),
        accessKeyId: form.accessKeyId.trim(),
        secretAccessKey: form.secretAccessKey.trim() || (existing?.kind === "s3" ? existing.secretAccessKey : ""),
        pathPrefix: trimOr(form.pathPrefix),
        forcePathStyle: form.forcePathStyle,
        encryptByDefault
      };
  }
}
function requiredFields(form, tr) {
  const out = [];
  if (!form.id.trim()) out.push(tr("storage.id"));
  if (!form.label.trim()) out.push(tr("storage.label"));
  switch (form.kind) {
    case "local":
      if (!form.directory.trim()) out.push(tr("storage.directory"));
      break;
    case "github":
      if (!form.owner.trim()) out.push(tr("storage.owner"));
      if (!form.repo.trim()) out.push(tr("storage.repo"));
      break;
    case "webdav":
      if (!form.url.trim()) out.push(tr("storage.url"));
      break;
    case "s3":
      if (!form.endpoint.trim()) out.push(tr("storage.endpoint"));
      if (!form.bucket.trim()) out.push(tr("storage.bucket"));
      if (!form.accessKeyId.trim()) out.push(tr("storage.accessKey"));
      break;
  }
  return out;
}
function errorText(err) {
  if (err instanceof VaultApiError) return `${err.message} (HTTP ${err.status})`;
  return err instanceof Error ? err.message : String(err);
}
function redactError(message, target) {
  let out = message;
  const secrets = [];
  if (target.kind === "webdav") {
    if (target.password) secrets.push(target.password);
  } else if (target.kind === "s3") {
    if (target.secretAccessKey) secrets.push(target.secretAccessKey);
  } else if (target.kind === "github") {
    if (target.token) secrets.push(target.token);
  }
  for (const s of secrets) {
    if (s && s.length >= 3) out = out.split(s).join("***");
  }
  return out.length > 300 ? `${out.slice(0, 300)}\u2026` : out;
}
function StoragePanel({ targets, busy, error, message, onUpsert, onDelete, snapshots, loading, testConnection, fs }) {
  const [pickerOpen, setPickerOpen] = (0, import_react9.useState)(false);
  const tr = useT();
  const locale = useLocale();
  const ids = (0, import_react9.useId)();
  const [form, setForm] = (0, import_react9.useState)(null);
  const [editing, setEditing] = (0, import_react9.useState)(false);
  const [touched, setTouched] = (0, import_react9.useState)(false);
  const [deleteId, setDeleteId] = (0, import_react9.useState)(null);
  const [tests, setTests] = (0, import_react9.useState)({});
  const editorRef = (0, import_react9.useRef)(null);
  const summaries = (0, import_react9.useMemo)(() => summarizeSnapshotsByTarget(targets, snapshots ?? []), [targets, snapshots]);
  const deleteTarget = targets.find((t) => t.id === deleteId) ?? null;
  const missing = form ? requiredFields(form, tr) : [];
  const duplicate = Boolean(form && targets.some((t) => t.id === form.id.trim()) && !editing);
  function openNew(kind = "local") {
    setForm({ ...EMPTY_FORM, kind, id: blankIdFor(kind, targets) });
    setEditing(false);
    setTouched(false);
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: "nearest" }));
  }
  function openEdit(t) {
    setForm(formFromTarget(t));
    setEditing(true);
    setTouched(false);
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: "nearest" }));
  }
  function patch(part) {
    setForm((prev) => prev ? { ...prev, ...part } : prev);
  }
  function save() {
    setTouched(true);
    if (!form) return;
    if (requiredFields(form, tr).length > 0) return;
    onUpsert(buildTarget(form, targets.find((t) => t.id === form.id.trim())));
  }
  async function runTest(t) {
    if (!testConnection) return;
    setTests((prev) => ({ ...prev, [t.id]: { status: "testing" } }));
    try {
      const r = await testConnection(t);
      setTests((prev) => ({
        ...prev,
        [t.id]: r.ok ? { status: "ok", count: r.count ?? 0 } : { status: "fail", error: redactError(r.error ?? tr("app.error"), t) }
      }));
    } catch (err) {
      setTests((prev) => ({ ...prev, [t.id]: { status: "fail", error: redactError(errorText(err), t) } }));
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { className: "dv-section-desc", children: tr("storage.desc") }),
    error ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Banner, { tone: "error", children: error }) : null,
    message ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Banner, { tone: "ok", children: message }) : null,
    loading && targets.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "dv-loading-inline", role: "status", children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dv-spinner", "aria-hidden": "true" }),
      tr("app.loading")
    ] }) : targets.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
      EmptyState,
      {
        title: tr("storage.emptyTitle"),
        body: tr("storage.emptyBody"),
        actions: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { variant: "primary", onClick: () => openNew("local"), children: tr("storage.addTitle") })
      }
    ) : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(CardList, { label: tr("storage.targetsLabel"), children: summaries.map(({ target, count, latest }) => {
      const test = tests[target.id] ?? { status: "idle" };
      return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(Card, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          CardHead,
          {
            title: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "dv-inline", children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(DotText, { tone: test.status === "fail" ? "danger" : count > 0 ? "ok" : "neutral", children: targetName(target, tr) }),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dv-card-sub dv-mono", children: target.id })
            ] }),
            sub: targetKindLabel(target, tr),
            actions: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Tag, { tone: target.encryptByDefault ? "ok" : "neutral", children: target.encryptByDefault ? tr("storage.encDefault") : tr("common.plaintext") }),
              hasStoredSecret(target) ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Tag, { children: tr("storage.storedCredentials") }) : null
            ] })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dv-card-sub dv-mono", style: { overflowWrap: "anywhere" }, children: targetLocation(target) }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "dv-card-sub", children: [
          tr("storage.snapshots", { count }),
          " \xB7 ",
          latest ? tr("storage.lastBackup", { time: `${formatDateTime(latest.createdAt, locale)}\uFF08${relativeLabel(tr, latest.createdAt)}\uFF09` }) : tr("storage.noSnapshots")
        ] }),
        test.status === "ok" ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dv-small", style: { color: "var(--dv-ok-label)" }, children: tr("storage.testOk", { count: test.count }) }) : null,
        test.status === "fail" ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dv-error-text", children: tr("storage.testFail", { error: test.error }) }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dv-card-actions", children: [
          testConnection ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", onClick: () => void runTest(target), loading: test.status === "testing", children: test.status === "testing" ? tr("storage.testing") : tr("storage.test") }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", onClick: () => openEdit(target), disabled: busy, children: tr("storage.edit") }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", variant: "danger", onClick: () => setDeleteId(target.id), disabled: busy, children: tr("storage.delete") })
        ] })
      ] }, target.id);
    }) }),
    !form ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dv-add-row", children: KINDS.map((k) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(Button, { variant: "dashed", onClick: () => openNew(k), disabled: busy, children: [
      "+ ",
      tr("storage.addKind", { kind: tr(KIND_ADD[k]) })
    ] }, k)) }) : null,
    form ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { ref: editorRef, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(Card, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        CardHead,
        {
          title: editing ? tr("storage.editTitle") : tr("storage.addTitle"),
          sub: tr("storage.addDesc"),
          actions: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { size: "sm", variant: "quiet", onClick: () => setForm(null), children: tr("storage.cancel") })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dv-card-sep", "aria-hidden": "true" }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "dv-chip-row", role: "radiogroup", "aria-label": tr("storage.kind"), children: KINDS.map((k) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        "button",
        {
          type: "button",
          role: "radio",
          className: "dv-chip",
          "aria-checked": form.kind === k,
          disabled: editing && form.kind !== k,
          onClick: () => patch({ kind: k, id: editing ? form.id : blankIdFor(k, targets) }),
          children: tr(KIND_LABEL[k])
        },
        k
      )) }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dv-grid-2", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field, { label: tr("storage.id"), htmlFor: `${ids}-id`, hint: tr("storage.idHint"), children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          TextInput,
          {
            id: `${ids}-id`,
            mono: true,
            value: form.id,
            placeholder: "local-default",
            maxLength: 64,
            onChange: (e) => patch({ id: e.target.value.replace(/\s+/g, "-").toLowerCase() }),
            disabled: editing,
            invalid: touched && !form.id.trim()
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field, { label: tr("storage.label"), htmlFor: `${ids}-label`, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          TextInput,
          {
            id: `${ids}-label`,
            value: form.label,
            maxLength: 80,
            placeholder: targetLabelPlaceholder(form.kind, tr),
            onChange: (e) => patch({ label: e.target.value }),
            invalid: touched && !form.label.trim()
          }
        ) })
      ] }),
      duplicate ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dv-hint", style: { color: "var(--dv-warn)" }, children: tr("storage.idExists") }) : null,
      form.kind === "local" ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(Field, { label: tr("storage.directory"), htmlFor: `${ids}-dir`, hint: tr("storage.directoryHint"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
            TextInput,
            {
              id: `${ids}-dir`,
              mono: true,
              value: form.directory,
              placeholder: "~/dsh-vault-backups",
              onChange: (e) => patch({ directory: e.target.value }),
              invalid: touched && !form.directory.trim()
            }
          ),
          fs ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { variant: "quiet", onClick: () => setPickerOpen(true), children: tr("backup.browse") }) : null
        ] }),
        fs ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          PathPicker,
          {
            open: pickerOpen,
            mode: "directory",
            fs,
            initialPath: form.directory,
            onClose: () => setPickerOpen(false),
            onSelect: (p) => {
              patch({ directory: p });
              setPickerOpen(false);
            }
          }
        ) : null
      ] }) : null,
      form.kind === "github" ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_jsx_runtime11.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dv-grid-2", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field, { label: tr("storage.owner"), htmlFor: `${ids}-owner`, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextInput, { id: `${ids}-owner`, mono: true, value: form.owner, onChange: (e) => patch({ owner: e.target.value }), placeholder: "octocat" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field, { label: tr("storage.repo"), htmlFor: `${ids}-repo`, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextInput, { id: `${ids}-repo`, mono: true, value: form.repo, onChange: (e) => patch({ repo: e.target.value }), placeholder: "dsh-backups" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field, { label: tr("storage.branch"), htmlFor: `${ids}-branch`, optional: true, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextInput, { id: `${ids}-branch`, mono: true, value: form.branch, onChange: (e) => patch({ branch: e.target.value }), placeholder: "main" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field, { label: tr("storage.pathPrefix"), htmlFor: `${ids}-prefix`, optional: true, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextInput, { id: `${ids}-prefix`, mono: true, value: form.pathPrefix, onChange: (e) => patch({ pathPrefix: e.target.value }) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field, { label: tr("storage.tokenCredential"), htmlFor: `${ids}-cred`, optional: true, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextInput, { id: `${ids}-cred`, mono: true, value: form.tokenCredential, onChange: (e) => patch({ tokenCredential: e.target.value }) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field, { label: tr("storage.token"), htmlFor: `${ids}-token`, hint: tr("storage.tokenHint"), optional: true, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(PasswordInput, { id: `${ids}-token`, value: form.token, onChange: (e) => patch({ token: e.target.value }), autoComplete: "off" }) })
      ] }) }) : null,
      form.kind === "webdav" ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field, { label: tr("storage.url"), htmlFor: `${ids}-url`, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextInput, { id: `${ids}-url`, mono: true, value: form.url, onChange: (e) => patch({ url: e.target.value }), placeholder: "https://dav.example.com/dsh" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dv-grid-2", children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field, { label: tr("storage.username"), htmlFor: `${ids}-user`, optional: true, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextInput, { id: `${ids}-user`, value: form.username, onChange: (e) => patch({ username: e.target.value }), autoComplete: "username" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
            Field,
            {
              label: tr("storage.password"),
              htmlFor: `${ids}-pass`,
              hint: editing ? tr("storage.passwordKeep") : void 0,
              optional: true,
              children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(PasswordInput, { id: `${ids}-pass`, value: form.password, onChange: (e) => patch({ password: e.target.value }), autoComplete: "new-password" })
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field, { label: tr("storage.pathPrefix"), htmlFor: `${ids}-wprefix`, optional: true, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextInput, { id: `${ids}-wprefix`, mono: true, value: form.pathPrefix, onChange: (e) => patch({ pathPrefix: e.target.value }) }) })
      ] }) : null,
      form.kind === "s3" ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_jsx_runtime11.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dv-grid-2", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field, { label: tr("storage.endpoint"), htmlFor: `${ids}-s3e`, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextInput, { id: `${ids}-s3e`, mono: true, value: form.endpoint, onChange: (e) => patch({ endpoint: e.target.value }), placeholder: "https://s3.example.com" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field, { label: tr("storage.bucket"), htmlFor: `${ids}-bucket`, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextInput, { id: `${ids}-bucket`, mono: true, value: form.bucket, onChange: (e) => patch({ bucket: e.target.value }), placeholder: "dsh-vault" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field, { label: tr("storage.region"), htmlFor: `${ids}-region`, optional: true, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextInput, { id: `${ids}-region`, mono: true, value: form.region, onChange: (e) => patch({ region: e.target.value }), placeholder: "auto" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field, { label: tr("storage.pathPrefix"), htmlFor: `${ids}-sprefix`, optional: true, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextInput, { id: `${ids}-sprefix`, mono: true, value: form.pathPrefix, onChange: (e) => patch({ pathPrefix: e.target.value }) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field, { label: tr("storage.accessKey"), htmlFor: `${ids}-ak`, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextInput, { id: `${ids}-ak`, mono: true, value: form.accessKeyId, onChange: (e) => patch({ accessKeyId: e.target.value }), autoComplete: "off" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Field, { label: tr("storage.secretKey"), htmlFor: `${ids}-sk`, hint: editing ? tr("storage.secretKeep") : void 0, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(PasswordInput, { id: `${ids}-sk`, value: form.secretAccessKey, onChange: (e) => patch({ secretAccessKey: e.target.value }), autoComplete: "new-password" }) })
      ] }) }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(Rows, { children: [
        form.kind === "s3" ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          SettingRow,
          {
            title: tr("storage.forcePathStyle"),
            description: tr("storage.forcePathStyleDesc"),
            htmlFor: `${ids}-pathstyle`,
            control: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
              Switch,
              {
                id: `${ids}-pathstyle`,
                checked: form.forcePathStyle,
                onChange: () => patch({ forcePathStyle: !form.forcePathStyle })
              }
            )
          }
        ) : null,
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          SettingRow,
          {
            title: tr("storage.encDefault"),
            description: tr("storage.encDefaultDesc"),
            htmlFor: `${ids}-enc`,
            control: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
              Switch,
              {
                id: `${ids}-enc`,
                checked: form.encryptByDefault,
                onChange: () => patch({ encryptByDefault: !form.encryptByDefault })
              }
            )
          }
        )
      ] }),
      touched && missing.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "dv-error-text", children: tr("storage.missing", { fields: missing.join(" / ") }) }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "dv-card-foot", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { onClick: () => setForm(null), children: tr("storage.cancel") }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Button, { variant: "primary", onClick: save, loading: busy, children: editing ? tr("storage.saveEdit") : tr("storage.saveNew") })
      ] })
    ] }) }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
      ConfirmDialog,
      {
        open: Boolean(deleteTarget),
        onClose: () => setDeleteId(null),
        title: tr("storage.deleteTitle", { label: deleteTarget?.label ?? "" }),
        description: tr("storage.deleteBody"),
        confirmLabel: tr("storage.deleteConfirm"),
        busy,
        onConfirm: () => {
          if (!deleteTarget) return;
          onDelete(deleteTarget.id);
          setDeleteId(null);
        }
      }
    )
  ] });
}
function targetLabelPlaceholder(kind, tr) {
  switch (kind) {
    case "local":
      return tr("storage.kind.local");
    case "github":
      return tr("storage.kind.github");
    case "webdav":
      return tr("storage.kind.webdav");
    default:
      return tr("storage.kind.s3");
  }
}

// src/client/components/SnapshotsPanel.tsx
var import_react10 = require("react");
var import_jsx_runtime12 = require("react/jsx-runtime");
var MAX_RENDER = 300;
function SnapshotsPanel({
  snapshots,
  busy,
  error,
  message,
  onRefresh,
  onDelete,
  onVerify,
  targets = [],
  loading,
  onRestoreRequest,
  onNavigateBackup
}) {
  const tr = useT();
  const locale = useLocale();
  const ids = (0, import_react10.useId)();
  const [targetFilter, setTargetFilter] = (0, import_react10.useState)("");
  const [mode, setMode] = (0, import_react10.useState)("all");
  const [query, setQuery] = (0, import_react10.useState)("");
  const [deleteKey, setDeleteKey] = (0, import_react10.useState)(null);
  const [verifyTarget, setVerifyTarget] = (0, import_react10.useState)(null);
  const [verifyPassword, setVerifyPassword] = (0, import_react10.useState)("");
  const [verifying, setVerifying] = (0, import_react10.useState)(false);
  const [results, setResults] = (0, import_react10.useState)({});
  const targetLabel = (id) => targetName(targets.find((t) => t.id === id), tr, id);
  const sorted = (0, import_react10.useMemo)(() => [...snapshots].sort(newestFirst), [snapshots]);
  const filtered = (0, import_react10.useMemo)(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((s) => {
      if (targetFilter && s.targetId !== targetFilter) return false;
      if (mode === "encrypted" && !s.encrypted) return false;
      if (mode === "plaintext" && s.encrypted) return false;
      if (mode === "secrets" && !s.includeSecrets) return false;
      if (q && !s.id.toLowerCase().includes(q) && !(s.notes ?? "").toLowerCase().includes(q) && !s.targetId.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sorted, targetFilter, mode, query]);
  const deleteTarget = snapshots.find((s) => `${s.targetId}:${s.id}` === deleteKey) ?? null;
  const hasFilters = Boolean(query || targetFilter || mode !== "all");
  async function runVerify(s, password) {
    const key = `${s.targetId}:${s.id}`;
    setResults((prev) => ({ ...prev, [key]: { status: "running" } }));
    try {
      const r = await onVerify(s.targetId, s.id, password);
      if (r && typeof r === "object" && "ok" in r && !r.ok) {
        setResults((prev) => ({ ...prev, [key]: { status: "fail", error: r.error ?? tr("app.error") } }));
        return false;
      }
      setResults((prev) => ({ ...prev, [key]: { status: "ok" } }));
      return true;
    } catch (err) {
      setResults((prev) => ({ ...prev, [key]: { status: "fail", error: err instanceof Error ? err.message : String(err) } }));
      return false;
    }
  }
  function requestVerify(s) {
    if (s.encrypted) {
      setVerifyTarget(s);
      setVerifyPassword("");
      return;
    }
    void runVerify(s);
  }
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "dv-section-desc", children: tr("snapshots.desc") }),
    error ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "dv-error-text", role: "alert", children: error }) : null,
    message ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "dv-hint", children: message }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dv-wrap", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { style: { flex: "1 1 200px", minWidth: 160 }, children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        SearchInput,
        {
          id: `${ids}-search`,
          value: query,
          onChange: setQuery,
          placeholder: tr("snapshots.search"),
          label: tr("snapshots.search")
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(Select, { "aria-label": tr("snapshots.filterTarget"), value: targetFilter, onChange: (e) => setTargetFilter(e.target.value), children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("option", { value: "", children: tr("common.allTargets") }),
        targets.map((t) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("option", { value: t.id, children: targetName(t, tr) }, t.id))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        Segmented,
        {
          label: tr("snapshots.filterMode"),
          value: mode,
          onChange: setMode,
          options: [
            { value: "all", label: tr("snapshots.mode.all") },
            { value: "encrypted", label: tr("snapshots.mode.encrypted") },
            { value: "plaintext", label: tr("snapshots.mode.plaintext") },
            { value: "secrets", label: tr("snapshots.mode.secrets") }
          ]
        }
      ),
      hasFilters ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Button, { size: "sm", variant: "quiet", onClick: () => {
        setQuery("");
        setTargetFilter("");
        setMode("all");
      }, children: tr("snapshots.clear") }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "dv-hint dv-num", style: { marginLeft: "auto" }, children: tr("snapshots.count", { shown: filtered.length, total: snapshots.length }) }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Button, { size: "sm", variant: "quiet", onClick: onRefresh, disabled: busy, children: tr("app.refresh") })
    ] }),
    loading && snapshots.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(LoadingInline, { label: tr("app.loading") }) : snapshots.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
      EmptyState,
      {
        title: tr("snapshots.emptyTitle"),
        body: tr("snapshots.emptyBody"),
        actions: onNavigateBackup ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Button, { variant: "primary", onClick: onNavigateBackup, children: tr("snapshots.goBackup") }) : null
      }
    ) : filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
      EmptyState,
      {
        title: tr("snapshots.noMatch"),
        actions: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Button, { size: "sm", onClick: () => {
          setQuery("");
          setTargetFilter("");
          setMode("all");
        }, children: tr("snapshots.clear") })
      }
    ) : /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(Card, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("ul", { className: "dv-list", children: filtered.slice(0, MAX_RENDER).map((s) => {
        const key = `${s.targetId}:${s.id}`;
        const state = results[key] ?? { status: "idle" };
        return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("li", { className: "dv-list-item", children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dv-list-main", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "dv-list-title dv-mono", title: s.id, children: s.id }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "dv-card-sub", children: [
              targetLabel(s.targetId),
              " \xB7 ",
              formatDateTime(s.createdAt, locale),
              "\uFF08",
              relativeLabel(tr, s.createdAt),
              "\uFF09 \xB7 ",
              formatBytes(s.bytes)
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "dv-tag-list", style: { marginTop: 4 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Tag, { tone: s.encrypted ? "ok" : "neutral", children: s.encrypted ? tr("common.encrypted") : tr("common.plaintext") }),
              s.includeSecrets ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Tag, { tone: "warn", children: tr("common.secrets") }) : null,
              state.status === "ok" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Tag, { tone: "ok", children: tr("snapshots.verified") }) : null,
              s.notes ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "dv-hint dv-truncate", style: { maxWidth: 200 }, title: s.notes, children: s.notes }) : null
            ] }),
            state.status === "fail" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "dv-error-text", children: tr("snapshots.verifyFail", { error: state.error }) }) : null
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "dv-list-meta", children: [
            onRestoreRequest ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Button, { size: "sm", variant: "quiet", onClick: () => onRestoreRequest(s.targetId, s.id), children: tr("snapshots.restoreAction") }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              Button,
              {
                size: "sm",
                variant: "quiet",
                onClick: () => requestVerify(s),
                loading: state.status === "running",
                "aria-label": `${tr("snapshots.verify")} ${s.id}`,
                children: state.status === "running" ? tr("snapshots.verifying") : tr("snapshots.verify")
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              Button,
              {
                size: "sm",
                variant: "quiet",
                onClick: () => setDeleteKey(key),
                disabled: busy,
                "aria-label": `${tr("common.delete")} ${s.id}`,
                style: { color: "var(--dv-danger)" },
                children: tr("common.delete")
              }
            )
          ] })
        ] }, key);
      }) }),
      filtered.length > MAX_RENDER ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "dv-hint", children: tr("snapshots.truncated", { shown: MAX_RENDER }) }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
      ConfirmDialog,
      {
        open: Boolean(deleteTarget),
        onClose: () => setDeleteKey(null),
        title: tr("snapshots.deleteTitle", { id: deleteTarget?.id ?? "" }),
        description: deleteTarget ? tr("snapshots.deleteBody", { target: targetLabel(deleteTarget.targetId) }) : void 0,
        confirmLabel: tr("snapshots.deleteConfirm"),
        busy,
        onConfirm: () => {
          if (!deleteTarget) return;
          onDelete(deleteTarget.targetId, deleteTarget.id);
          setDeleteKey(null);
        },
        children: deleteTarget ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("dl", { className: "dv-kv", children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: tr("common.size") }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dd", { children: formatBytes(deleteTarget.bytes) }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: tr("common.createdAt") }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dd", { children: formatDateTime(deleteTarget.createdAt, locale) }),
          deleteTarget.notes ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dt", { children: tr("common.notes") }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("dd", { children: deleteTarget.notes })
          ] }) : null
        ] }) : null
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
      Dialog,
      {
        open: Boolean(verifyTarget),
        onClose: () => {
          if (!verifying) setVerifyTarget(null);
        },
        title: tr("snapshots.verify"),
        description: tr("snapshots.verifyPasswordHint"),
        actions: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Button, { onClick: () => setVerifyTarget(null), disabled: verifying, children: tr("app.cancel") }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
            Button,
            {
              variant: "primary",
              loading: verifying,
              disabled: !verifyPassword,
              onClick: async () => {
                if (!verifyTarget) return;
                setVerifying(true);
                const ok = await runVerify(verifyTarget, verifyPassword);
                setVerifying(false);
                if (ok) {
                  setVerifyTarget(null);
                  setVerifyPassword("");
                }
              },
              children: tr("snapshots.verify")
            }
          )
        ] }),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Field, { label: tr("snapshots.verifyPassword"), htmlFor: `${ids}-verify-pass`, children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
            PasswordInput,
            {
              id: `${ids}-verify-pass`,
              value: verifyPassword,
              onChange: (e) => setVerifyPassword(e.target.value),
              autoComplete: "off",
              onKeyDown: (e) => {
                if (e.key === "Enter" && verifyPassword && verifyTarget && !verifying) {
                  setVerifying(true);
                  void runVerify(verifyTarget, verifyPassword).then((ok) => {
                    setVerifying(false);
                    if (ok) {
                      setVerifyTarget(null);
                      setVerifyPassword("");
                    }
                  });
                }
              }
            }
          ) }),
          verifying ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(LoadingInline, { label: tr("snapshots.verifying") }) : null
        ]
      }
    )
  ] });
}

// src/client/components/SettingsPanel.tsx
var import_react11 = require("react");
var import_jsx_runtime13 = require("react/jsx-runtime");
var DEFAULT_SCHEDULE = {
  enabled: false,
  intervalMinutes: 1440,
  targetId: "local-default",
  encrypt: false,
  includeSecrets: false,
  retention: { keepLast: 10 }
};
var INTERVAL_PRESETS = [60, 360, 720, 1440, 10080];
var KEEP_PRESETS = [5, 10, 20, 50, 100];
function mergeSchedule(base, patch) {
  return {
    ...base,
    ...patch,
    retention: { ...base.retention, ...patch.retention ?? {} }
  };
}
function SettingsPanel({
  settings,
  busy,
  error,
  message,
  onSave,
  onRunSchedule,
  targets = [],
  loading,
  onRetry,
  locale
}) {
  const tr = useT();
  const ids = (0, import_react11.useId)();
  const [keepLast, setKeepLast] = (0, import_react11.useState)(() => String(settings?.retention.keepLast ?? 10));
  const [schedule, setSchedule] = (0, import_react11.useState)(() => settings?.schedule ?? DEFAULT_SCHEDULE);
  const [defaultTargetId, setDefaultTargetId] = (0, import_react11.useState)(() => settings?.defaultTargetId ?? "");
  const [kdf, setKdf] = (0, import_react11.useState)(() => settings?.preferredKdf ?? "scrypt");
  const [dirty, setDirty] = (0, import_react11.useState)(false);
  const [customInterval, setCustomInterval] = (0, import_react11.useState)("");
  (0, import_react11.useEffect)(() => {
    if (!settings) return;
    setKeepLast(String(settings.retention.keepLast));
    setSchedule(settings.schedule);
    setDefaultTargetId(settings.defaultTargetId ?? "");
    setKdf(settings.preferredKdf);
    setDirty(false);
  }, [settings]);
  const validTargetIds = (0, import_react11.useMemo)(() => new Set(targets.map((t) => t.id)), [targets]);
  if (!settings && loading) {
    return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(import_jsx_runtime13.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "dv-section-desc", children: tr("schedule.desc") }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(LoadingState, { label: tr("schedule.loading") })
    ] });
  }
  if (!settings) {
    return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(import_jsx_runtime13.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "dv-section-desc", children: tr("schedule.desc") }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(ErrorState, { error: error ?? tr("app.error"), onRetry })
    ] });
  }
  const updateSchedule = (patch) => {
    setSchedule((prev) => mergeSchedule(prev, patch));
    setDirty(true);
  };
  const scheduleTargetMissing = Boolean(schedule.targetId) && targets.length > 0 && !validTargetIds.has(schedule.targetId);
  const intervalTooSmall = schedule.intervalMinutes < 15;
  const isPreset = INTERVAL_PRESETS.includes(schedule.intervalMinutes);
  function save() {
    const keep = Math.min(200, Math.max(1, Number(keepLast) || 10));
    const interval = Math.max(15, Math.round(Number(schedule.intervalMinutes) || 15));
    onSave({
      retention: { keepLast: keep },
      schedule: mergeSchedule(schedule, { intervalMinutes: interval, retention: { keepLast: keep } }),
      ...defaultTargetId ? { defaultTargetId } : {},
      preferredKdf: kdf
    });
    setDirty(false);
    setCustomInterval("");
  }
  function discard() {
    setKeepLast(String(settings.retention.keepLast));
    setSchedule(settings.schedule);
    setDefaultTargetId(settings.defaultTargetId ?? "");
    setKdf(settings.preferredKdf);
    setCustomInterval("");
    setDirty(false);
  }
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(import_jsx_runtime13.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "dv-section-desc", children: tr("schedule.desc") }),
    error ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Banner, { tone: "error", children: error }) : null,
    message ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Banner, { tone: "ok", children: message }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(Rows, { label: tr("schedule.desc"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        SettingRow,
        {
          title: tr("schedule.enabled"),
          description: tr("schedule.enabledDesc"),
          htmlFor: `${ids}-on`,
          control: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Switch, { id: `${ids}-on`, checked: schedule.enabled, onChange: () => updateSchedule({ enabled: !schedule.enabled }) })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        SettingRow,
        {
          stacked: true,
          title: tr("schedule.interval"),
          htmlFor: `${ids}-interval`,
          description: schedule.enabled ? schedule.nextRunAt ? tr("schedule.interval.desc", { next: `${formatDateTime(schedule.nextRunAt, locale)}\uFF08${relativeLabel(tr, schedule.nextRunAt)}\uFF09` }) : scheduleLabel(locale, schedule.intervalMinutes) : void 0,
          children: /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "dv-wrap", children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
              Chips,
              {
                label: tr("schedule.intervalLabel"),
                value: isPreset ? schedule.intervalMinutes : void 0,
                options: [
                  ...INTERVAL_PRESETS.map((m) => ({ value: m, label: scheduleLabel(locale, m) })),
                  { value: -1, label: tr("schedule.custom") }
                ],
                onChange: (v) => {
                  if (v === -1) {
                    setCustomInterval(String(schedule.intervalMinutes));
                    return;
                  }
                  setCustomInterval("");
                  updateSchedule({ intervalMinutes: v });
                }
              }
            ),
            !isPreset || customInterval !== "" ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Field, { label: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "dv-sr-only", children: tr("schedule.custom") }), htmlFor: `${ids}-interval`, error: intervalTooSmall ? tr("schedule.intervalMin") : null, children: /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: "dv-inline", children: [
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
                TextInput,
                {
                  id: `${ids}-interval`,
                  type: "number",
                  min: 15,
                  step: 1,
                  className: "dv-input dv-num-input",
                  value: customInterval || String(schedule.intervalMinutes),
                  onChange: (e) => {
                    setCustomInterval(e.target.value);
                    updateSchedule({ intervalMinutes: Number(e.target.value) || 0 });
                  },
                  onBlur: () => {
                    const v = Math.max(15, Math.round(Number(customInterval) || schedule.intervalMinutes || 15));
                    updateSchedule({ intervalMinutes: v });
                    setCustomInterval("");
                  },
                  invalid: intervalTooSmall
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "dv-hint", children: tr("schedule.customUnit") })
            ] }) }) : null
          ] })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        SettingRow,
        {
          stacked: true,
          title: tr("schedule.target"),
          description: scheduleTargetMissing ? tr("schedule.targetMissing") : void 0,
          htmlFor: `${ids}-target`,
          control: /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(
            Select,
            {
              id: `${ids}-target`,
              value: schedule.targetId,
              onChange: (e) => updateSchedule({ targetId: e.target.value }),
              children: [
                targets.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("option", { value: "", children: "\u2014" }) : null,
                scheduleTargetMissing ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("option", { value: schedule.targetId, children: schedule.targetId }) : null,
                targets.map((t) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("option", { value: t.id, children: [
                  targetName(t, tr),
                  " \xB7 ",
                  targetKindLabel(t, tr)
                ] }, t.id))
              ]
            }
          )
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        SettingRow,
        {
          title: tr("schedule.encrypt"),
          description: tr("schedule.encryptDesc"),
          htmlFor: `${ids}-enc`,
          control: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
            Switch,
            {
              id: `${ids}-enc`,
              checked: schedule.encrypt,
              onChange: () => updateSchedule({ encrypt: !schedule.encrypt, includeSecrets: schedule.encrypt ? false : schedule.includeSecrets })
            }
          )
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        SettingRow,
        {
          title: tr("schedule.secrets"),
          description: schedule.encrypt ? tr("schedule.secretsDescEncrypted") : tr("schedule.secretsDescHalted"),
          htmlFor: `${ids}-secrets`,
          control: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
            Switch,
            {
              id: `${ids}-secrets`,
              checked: schedule.includeSecrets && schedule.encrypt,
              disabled: !schedule.encrypt,
              onChange: () => updateSchedule({ includeSecrets: !schedule.includeSecrets })
            }
          )
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        SettingRow,
        {
          title: tr("schedule.lastRun"),
          control: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "dv-muted", children: schedule.lastRunAt ? `${formatDateTime(schedule.lastRunAt, locale)}\uFF08${relativeLabel(tr, schedule.lastRunAt)}\uFF09` : tr("common.never") })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        SettingRow,
        {
          title: tr("schedule.runNow"),
          description: schedule.enabled ? tr("schedule.runNowDesc") : tr("schedule.runDisabled"),
          control: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Button, { onClick: onRunSchedule, disabled: busy || !schedule.enabled, loading: busy, children: tr("schedule.runNow") })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        SettingRow,
        {
          stacked: true,
          title: tr("schedule.retentionTitle"),
          description: tr("schedule.retentionDesc"),
          htmlFor: `${ids}-keep`,
          children: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Field, { label: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "dv-sr-only", children: tr("schedule.keepLast") }), htmlFor: `${ids}-keep`, hint: tr("schedule.keepLastHint"), children: /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "dv-wrap", children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: "dv-inline", children: [
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
                TextInput,
                {
                  id: `${ids}-keep`,
                  type: "number",
                  min: 1,
                  max: 200,
                  className: "dv-input dv-num-input",
                  value: keepLast,
                  onChange: (e) => {
                    setKeepLast(e.target.value);
                    setDirty(true);
                  }
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "dv-hint", children: tr("schedule.keepLastUnit") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
              Chips,
              {
                label: tr("schedule.keepLast"),
                value: KEEP_PRESETS.includes(Number(keepLast)) ? Number(keepLast) : void 0,
                options: KEEP_PRESETS.map((n) => ({ value: n, label: String(n) })),
                onChange: (n) => {
                  setKeepLast(String(n));
                  setDirty(true);
                }
              }
            )
          ] }) })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        SettingRow,
        {
          stacked: true,
          title: tr("schedule.defaultTarget"),
          description: tr("schedule.defaultTargetDesc"),
          htmlFor: `${ids}-default`,
          control: /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(
            Select,
            {
              id: `${ids}-default`,
              value: defaultTargetId,
              onChange: (e) => {
                setDefaultTargetId(e.target.value);
                setDirty(true);
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("option", { value: "", children: tr("common.none") }),
                targets.map((t) => /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("option", { value: t.id, children: targetName(t, tr) }, t.id))
              ]
            }
          )
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        SettingRow,
        {
          title: tr("schedule.kdf"),
          description: tr("schedule.kdfDesc"),
          htmlFor: `${ids}-kdf`,
          control: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
            Segmented,
            {
              label: tr("schedule.kdf"),
              value: kdf,
              onChange: (v) => {
                setKdf(v);
                setDirty(true);
              },
              options: [
                { value: "scrypt", label: tr("schedule.kdf.scrypt") },
                { value: "argon2id", label: tr("schedule.kdf.argon2id") }
              ]
            }
          )
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        SettingRow,
        {
          title: tr("schedule.language"),
          description: tr("schedule.languageDesc"),
          control: /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: "dv-muted", children: [
            locale === "zh" ? tr("schedule.lang.zh") : tr("schedule.lang.en"),
            " \xB7 ",
            tr("schedule.lang.auto")
          ] })
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "dv-card-foot", style: { justifyContent: "space-between" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "dv-hint", children: dirty ? tr("schedule.dirty") : "" }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: "dv-inline", children: [
        dirty ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Button, { onClick: discard, disabled: busy, children: tr("schedule.discard") }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Button, { variant: "primary", onClick: save, loading: busy, children: busy ? tr("schedule.saving") : tr("schedule.save") })
      ] })
    ] })
  ] });
}

// src/client/theme.css
var css = `/* ==========================================================================
   dsh-vault \u2014 settings section styles

   Rendered inside the host's Settings modal (right content column, ~450\u2013520px).
   The host owns the frame, navigation, colors and light/dark theme, so this
   stylesheet only:

     1. maps a small set of --dv-* aliases onto host --dsw-* tokens
        (with light-theme fallbacks), and
     2. recreates native-looking settings rows, segmented tabs, provider
        cards, buttons, switches and inputs from those tokens.

   No gradients, glows, shadows or brand palette. Host tokens switch with the
   theme automatically; the fallbacks below match the default (light) theme.
   ========================================================================== */

.dsh-vault-root {
  /* ---- color --------------------------------------------------------- */
  --dv-text: var(--dsw-alias-label-primary, #14171c);
  --dv-text-secondary: var(--dsw-alias-label-secondary, #5c6169);
  --dv-text-tertiary: var(--dsw-alias-label-tertiary, #81858c);
  --dv-text-caption: var(--dsw-alias-label-caption, #a0a4ab);
  --dv-bg-layer-1: var(--dsw-alias-bg-layer-1, #ffffff);
  --dv-bg-layer-2: var(--dsw-alias-bg-layer-2, #fafafa);
  --dv-bg-layer-3: var(--dsw-alias-bg-layer-3, #ffffff);
  --dv-bg-module: var(--dsw-alias-bg-module-platform, #f5f6f7);
  --dv-bg-selected: var(--dsw-alias-bg-document-preview, #ebeef2);
  --dv-bg-skeleton: var(--dsw-alias-bg-skeleton, #eef0f2);
  --dv-border-l1: var(--dsw-alias-border-l1, #0000000f);
  --dv-border-l2: var(--dsw-alias-border-l2, #0000001a);
  --dv-border-l3: var(--dsw-alias-border-l3, #00000026);
  --dv-border-l4: var(--dsw-alias-border-l4, #00000033);
  --dv-on-primary: var(--dsw-alias-bg-layer-3, #ffffff);

  --dv-ok: var(--dsw-alias-state-success-primary, #22c55e);
  --dv-ok-label: var(--dsw-alias-state-success-primary, #16a34a);
  --dv-warn: var(--dsw-alias-state-warn-primary, #dd8629);
  --dv-warn-bg: var(--dsw-alias-state-warn-tertiary, #fef5e7);
  --dv-danger: var(--dsw-alias-state-error-primary, #ec1313);
  --dv-info: var(--dsw-alias-state-business-primary, #4176e6);
  --dv-info-bg: var(--dsw-alias-state-business-tertiary, #e4edfd);
  --dv-neutral-dot: var(--dsw-alias-label-caption, #a0a4ab);

  --dv-focus: var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #4176e6));
  --dv-focus-width: var(--dsw-focus-ring-width, 2px);

  /* ---- type / geometry ---------------------------------------------- */
  --dv-font: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif);
  --dv-mono: var(--dsw-font-markdown-code-font-family, ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace);
  --dv-radius-xs: var(--dsw-radius-xs, 4px);
  --dv-radius-sm: var(--dsw-radius-sm, 8px);
  --dv-radius-md: var(--dsw-radius-md, 12px);
  --dv-radius-lg: var(--dsw-radius-lg, 16px);
  --dv-radius-xl: var(--dsw-radius-xl, 20px);

  font-family: var(--dv-font);
  font-size: 14px;
  line-height: 1.5;
  color: var(--dv-text);
  background: transparent;
  -webkit-font-smoothing: antialiased;
  text-align: left;
}

.dsh-vault-root *,
.dsh-vault-root *::before,
.dsh-vault-root *::after {
  box-sizing: border-box;
}

.dsh-vault-root :focus-visible {
  outline: var(--dv-focus-width) solid var(--dv-focus);
  outline-offset: 2px;
}

.dsh-vault-root button,
.dsh-vault-root input,
.dsh-vault-root select,
.dsh-vault-root textarea {
  font: inherit;
  color: inherit;
}

.dsh-vault-root code,
.dsh-vault-root .dv-mono {
  font-family: var(--dv-mono);
  font-size: 0.92em;
}

.dv-num {
  font-variant-numeric: tabular-nums;
}

.dv-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.dv-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* Skip link \u2014 visually hidden until focused. */
.dv-skip {
  position: absolute;
  left: 0;
  top: -40px;
  padding: 6px 10px;
  border-radius: var(--dv-radius-sm);
  background: var(--dv-bg-module);
  color: var(--dv-text);
  text-decoration: none;
  z-index: 1;
}
.dv-skip:focus {
  top: 0;
}

/* ==========================================================================
   Section layout
   ========================================================================== */

.dv-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.dv-section-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dv-section-title {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 400;
  color: var(--dv-text);
}

.dv-section-desc {
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  color: var(--dv-text-secondary);
}

/* Sub-section tabs: a quiet row; selected = gray pill (native nav highlight). */
.dv-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.dv-tab {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--dv-text-secondary);
  font-size: 14px;
  line-height: 20px;
  padding: 6px 12px;
  margin-left: -4px;
  border-radius: var(--dv-radius-md);
  cursor: pointer;
  white-space: nowrap;
}
.dv-tab:first-child {
  margin-left: 0;
}
.dv-tab:hover {
  color: var(--dv-text);
  background: var(--dv-bg-module);
}
.dv-tab[aria-selected='true'] {
  color: var(--dv-text);
  background: var(--dv-bg-selected);
}

.dv-section-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* ==========================================================================
   Setting rows
   ========================================================================== */

.dv-rows {
  display: flex;
  flex-direction: column;
}

.dv-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
  border-bottom: 1px solid var(--dv-border-l2);
  min-width: 0;
}
.dv-row:first-child {
  padding-top: 0;
}
.dv-row:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.dv-row-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  /* Native rows leave room so long labels never touch the control, but the
     long status sentences on the right get more share of the width here. */
  padding-right: 16px;
  flex: 1 1 auto;
}

.dv-row-title {
  font-size: 14px;
  line-height: 22px;
  font-weight: 400;
  color: var(--dv-text);
}

.dv-row-desc {
  font-size: 12px;
  line-height: 18px;
  color: var(--dv-text-tertiary);
}

.dv-row-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 62%;
  text-align: right;
}

.dv-row[data-stack='true'] {
  flex-direction: column;
  align-items: stretch;
}
.dv-row[data-stack='true'] .dv-row-text {
  padding-right: 0;
}
.dv-row[data-stack='true'] .dv-row-control {
  max-width: none;
}

/* Status line with a dot (overview, target state). */
.dv-dottext {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--dv-text);
}
.dv-dottext > span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dv-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
  background: var(--dv-neutral-dot);
}
.dv-dot[data-tone='ok'] {
  background: var(--dv-ok);
}
.dv-dot[data-tone='warn'] {
  background: var(--dv-warn);
}
.dv-dot[data-tone='danger'] {
  background: var(--dv-danger);
}

.dv-inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.dv-muted {
  color: var(--dv-text-tertiary);
}
.dv-secondary {
  color: var(--dv-text-secondary);
}
.dv-small {
  font-size: 12px;
  line-height: 18px;
}
.dv-error-text {
  color: var(--dv-danger);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}

/* ==========================================================================
   Provider-style cards (targets, restore diff, snapshot items)
   ========================================================================== */

.dv-card {
  background: var(--dv-bg-module);
  border-radius: var(--dv-radius-lg);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.dv-card-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.dv-card-head {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  min-width: 0;
}
.dv-card-head > div:first-child {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 8px;
  row-gap: 2px;
  min-width: 0;
}

.dv-card-title {
  font-size: 14px;
  line-height: 22px;
  color: var(--dv-text);
  overflow-wrap: anywhere;
}

.dv-card-sub {
  font-size: 12px;
  line-height: 18px;
  color: var(--dv-text-tertiary);
  overflow-wrap: anywhere;
}

.dv-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}
.dv-card-actions .dv-select,
.dv-card-actions .dv-input {
  max-width: 100%;
}

.dv-card-sep {
  height: 1px;
  background: var(--dv-border-l2);
  margin: 2px 0;
}

.dv-card-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

/* ==========================================================================
   Buttons
   ========================================================================== */

.dv-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  padding: 5px 14px;
  border: 1px solid transparent;
  border-radius: var(--dv-radius-md);
  background: var(--dv-bg-module);
  color: var(--dv-text);
  font-size: 14px;
  line-height: 20px;
  cursor: pointer;
  white-space: nowrap;
  text-decoration: none;
  transition: opacity 0.12s ease, background-color 0.12s ease;
}
.dv-btn:hover:not(:disabled) {
  opacity: 0.86;
}
.dv-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Primary: label-primary fill, layer-3 text \u2014 black on light, white on dark. */
.dv-btn[data-variant='primary'] {
  background: var(--dv-text);
  color: var(--dv-on-primary);
}

/* Secondary: layer-1 fill with a hairline border (native Cancel). */
.dv-btn[data-variant='secondary'] {
  background: var(--dv-bg-layer-1);
  border-color: var(--dv-border-l3);
}

/* Text button: no chrome until hover. */
.dv-btn[data-variant='quiet'] {
  background: transparent;
  border-color: transparent;
  color: var(--dv-text-secondary);
  padding: 5px 8px;
}
.dv-btn[data-variant='quiet']:hover:not(:disabled) {
  background: var(--dv-bg-module);
  color: var(--dv-text);
}

/* Destructive: neutral fill, error text only. */
.dv-btn[data-variant='danger'] {
  background: transparent;
  border-color: var(--dv-border-l3);
  color: var(--dv-danger);
}
.dv-btn[data-variant='danger']:hover:not(:disabled) {
  opacity: 1;
  border-color: color-mix(in srgb, var(--dv-danger) 45%, transparent);
}

/* Destructive confirm: error fill, white text. */
.dv-btn[data-variant='danger-solid'] {
  background: var(--dv-danger);
  color: #fff;
}

.dv-btn[data-size='sm'] {
  min-height: 28px;
  padding: 2px 10px;
  font-size: 13px;
  border-radius: var(--dv-radius-md);
}

.dv-btn[data-block='true'] {
  width: 100%;
}

/* Dashed "add" row for lists (native "Add model provider" style). */
.dv-btn[data-variant='dashed'] {
  width: 100%;
  flex: 1 1 140px;
  background: transparent;
  border: 1px dashed var(--dv-border-l3);
  color: var(--dv-text);
}
.dv-btn[data-variant='dashed']:hover:not(:disabled) {
  background: var(--dv-bg-module);
  opacity: 1;
}

.dv-iconbtn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--dv-radius-sm);
  background: transparent;
  color: var(--dv-text-tertiary);
  cursor: pointer;
  flex: none;
}
.dv-iconbtn:hover:not(:disabled) {
  background: var(--dv-bg-selected);
  color: var(--dv-text);
}
.dv-iconbtn[data-variant='danger']:hover:not(:disabled) {
  color: var(--dv-danger);
}
.dv-iconbtn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Small selectable chip used for interval presets and retention presets. */
.dv-chip {
  appearance: none;
  border: 1px solid var(--dv-border-l3);
  background: var(--dv-bg-layer-1);
  color: var(--dv-text);
  border-radius: var(--dv-radius-md);
  padding: 3px 10px;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
  white-space: nowrap;
}
.dv-chip:hover {
  background: var(--dv-bg-module);
}
.dv-chip[aria-pressed='true'] {
  background: var(--dv-bg-module);
  border-color: var(--dv-border-l4);
}
.dv-chip:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.dv-add-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.dv-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* ==========================================================================
   Segmented control (diff filter, per-item conflict choice)
   ========================================================================== */

.dv-segment {
  display: inline-flex;
  padding: 2px;
  gap: 2px;
  border-radius: var(--dv-radius-md);
  background: var(--dv-bg-module);
  max-width: 100%;
}
.dv-segment button {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--dv-text-secondary);
  border-radius: calc(var(--dv-radius-md) - 2px);
  padding: 2px 10px;
  font-size: 13px;
  min-height: 24px;
  line-height: 20px;
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.dv-segment button:hover {
  color: var(--dv-text);
}
.dv-segment button[aria-pressed='true'] {
  background: var(--dv-bg-layer-1);
  color: var(--dv-text);
}
.dv-segment .dv-count {
  color: var(--dv-text-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

/* ==========================================================================
   Inputs
   ========================================================================== */

.dv-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.dv-label {
  font-size: 12px;
  line-height: 18px;
  color: var(--dv-text-secondary);
}

.dv-hint {
  font-size: 12px;
  line-height: 18px;
  color: var(--dv-text-tertiary);
}

.dv-input,
.dv-select,
.dv-textarea {
  width: 100%;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--dv-border-l3);
  border-radius: var(--dv-radius-sm);
  background: var(--dv-bg-layer-1);
  color: var(--dv-text);
  font-size: 14px;
  line-height: 30px;
}
.dv-textarea {
  height: auto;
  min-height: 64px;
  padding: 6px 10px;
  line-height: 20px;
  resize: vertical;
}
.dv-input::placeholder,
.dv-textarea::placeholder {
  color: var(--dv-text-caption);
}
.dv-input[aria-invalid='true'],
.dv-textarea[aria-invalid='true'] {
  border-color: color-mix(in srgb, var(--dv-danger) 60%, transparent);
}
.dv-input:disabled,
.dv-textarea:disabled,
.dv-select:disabled {
  background: var(--dv-bg-module);
  color: var(--dv-text-tertiary);
  cursor: not-allowed;
}

/* Native select rendered as the host's gray picker with a small chevron. */
.dv-select {
  appearance: none;
  -webkit-appearance: none;
  width: auto;
  max-width: 100%;
  height: 32px;
  padding: 0 30px 0 14px;
  border: 0;
  border-radius: var(--dv-radius-md);
  background-color: var(--dv-bg-module);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2381858c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  font-size: 14px;
  cursor: pointer;
  text-overflow: ellipsis;
}
.dv-select[data-block='true'] {
  width: 100%;
}

.dv-input-group {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
}
.dv-input-group .dv-input {
  padding-right: 34px;
}
.dv-input-group .dv-iconbtn {
  position: absolute;
  right: 2px;
}

.dv-num-input {
  width: 72px;
  text-align: right;
}

/* Checkbox (native input, custom mark). */
.dv-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
  min-width: 0;
}
.dv-check input {
  appearance: none;
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  margin: 1px 0 0;
  flex: none;
  border: 1px solid var(--dv-border-l3);
  border-radius: var(--dv-radius-xs);
  background: var(--dv-bg-layer-1);
  display: grid;
  place-content: center;
  cursor: pointer;
}
.dv-check input:checked {
  background: var(--dv-text);
  border-color: var(--dv-text);
}
.dv-check input:checked::after {
  content: '';
  width: 8px;
  height: 4px;
  border: 2px solid var(--dv-on-primary);
  border-top: 0;
  border-right: 0;
  transform: translateY(-1px) rotate(-45deg);
}
.dv-check input:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.dv-check-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.dv-check-title {
  font-size: 14px;
  line-height: 20px;
  color: var(--dv-text);
}
.dv-check-desc {
  font-size: 12px;
  line-height: 18px;
  color: var(--dv-text-tertiary);
}
.dv-check[data-disabled='true'] {
  cursor: not-allowed;
}
.dv-check[data-disabled='true'] .dv-check-title {
  color: var(--dv-text-tertiary);
}

/* Switch: label-primary track when on, layer-3 knob. */
.dv-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  flex: none;
}
.dv-switch input {
  position: absolute;
  inset: 0;
  opacity: 0;
  margin: 0;
  cursor: pointer;
}
.dv-switch-track {
  position: relative;
  width: 28px;
  height: 16px;
  border-radius: 999px;
  background: var(--dv-border-l4);
  transition: background-color 0.15s ease;
}
.dv-switch-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--dv-on-primary);
  transition: transform 0.15s ease;
}
.dv-switch input:checked + .dv-switch-track {
  background: var(--dv-text);
}
.dv-switch input:checked + .dv-switch-track::after {
  transform: translateX(12px);
}
.dv-switch input:focus-visible + .dv-switch-track {
  outline: var(--dv-focus-width) solid var(--dv-focus);
  outline-offset: 2px;
}
.dv-switch input:disabled + .dv-switch-track {
  opacity: 0.4;
}
.dv-switch[data-disabled='true'] {
  cursor: not-allowed;
}

/* Radio / checkbox tile (target and snapshot selection). */
.dv-option {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--dv-border-l2);
  border-radius: var(--dv-radius-md);
  background: var(--dv-bg-layer-1);
  cursor: pointer;
  min-width: 0;
}
.dv-option:hover {
  background: var(--dv-bg-module);
}
.dv-option[data-selected='true'] {
  border-color: var(--dv-border-l4);
  background: var(--dv-bg-module);
}
.dv-option input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}
.dv-option:focus-within {
  outline: var(--dv-focus-width) solid var(--dv-focus);
  outline-offset: 1px;
}
.dv-option-mark {
  width: 16px;
  height: 16px;
  margin-top: 2px;
  flex: none;
  border: 1px solid var(--dv-border-l3);
  border-radius: 50%;
  display: grid;
  place-content: center;
  background: var(--dv-bg-layer-1);
}
.dv-option[data-selected='true'] .dv-option-mark {
  border-color: var(--dv-text);
}
.dv-option[data-shape='square'] .dv-option-mark {
  border-radius: var(--dv-radius-xs);
}
.dv-option-mark > span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dv-text);
}
.dv-option[data-shape='square'] .dv-option-mark > span {
  width: 4px;
  height: 8px;
  border-radius: 0;
  border: 2px solid var(--dv-on-primary);
  border-top: 0;
  border-left: 0;
  background: none;
  transform: translateY(-1px) rotate(45deg);
}
.dv-option[data-shape='square'][data-selected='true'] .dv-option-mark {
  background: var(--dv-text);
}
.dv-option-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.dv-option-title {
  font-size: 14px;
  line-height: 20px;
  color: var(--dv-text);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}
.dv-option-desc {
  font-size: 12px;
  line-height: 18px;
  color: var(--dv-text-tertiary);
  overflow-wrap: anywhere;
}

.dv-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ==========================================================================
   Status text, tags, banners
   ========================================================================== */

.dv-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  border-radius: var(--dv-radius-xs);
  background: var(--dv-bg-module);
  border: 1px solid var(--dv-border-l2);
  color: var(--dv-text-secondary);
  font-size: 12px;
  line-height: 18px;
}
.dv-tag[data-tone='ok'] {
  color: var(--dv-ok-label);
}
.dv-tag[data-tone='warn'] {
  color: var(--dv-warn);
}
.dv-tag[data-tone='danger'] {
  color: var(--dv-danger);
}
.dv-tag[data-tone='info'] {
  color: var(--dv-info);
}

.dv-tag-list {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}

.dv-banner {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--dv-radius-md);
  border: 1px solid var(--dv-border-l2);
  background: var(--dv-bg-module);
  font-size: 13px;
  line-height: 20px;
  color: var(--dv-text);
  overflow-wrap: anywhere;
}
.dv-banner[data-tone='error'] {
  border-color: color-mix(in srgb, var(--dv-danger) 35%, transparent);
  color: var(--dv-danger);
  background: var(--dv-bg-layer-1);
}
.dv-banner[data-tone='warn'] {
  background: var(--dv-warn-bg);
  border-color: color-mix(in srgb, var(--dv-warn) 30%, transparent);
}
.dv-banner[data-tone='info'] {
  background: var(--dv-info-bg);
  border-color: transparent;
}
.dv-banner-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dv-banner-title {
  font-weight: 500;
}
.dv-banner ul {
  margin: 0;
  padding-left: 18px;
}

/* ==========================================================================
   Lists / tables (snapshots, diff)
   ========================================================================== */

.dv-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.dv-list-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--dv-border-l2);
  min-width: 0;
}
.dv-list-item:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}
.dv-list-item:first-child {
  padding-top: 0;
}

.dv-list-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.dv-list-title {
  font-size: 14px;
  line-height: 20px;
  color: var(--dv-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dv-list-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
  flex: none;
}

.dv-scroll {
  overflow-x: auto;
  min-width: 0;
}

.dv-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.dv-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

@media (max-width: 420px) {
  .dv-grid-2 {
    grid-template-columns: minmax(0, 1fr);
  }
  .dv-row {
    flex-direction: column;
    align-items: stretch;
  }
  .dv-row-text {
    padding-right: 0;
  }
  .dv-row-control {
    max-width: none;
    justify-content: flex-start;
    text-align: left;
  }
}

.dv-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.dv-table th {
  text-align: left;
  font-weight: 400;
  color: var(--dv-text-tertiary);
  font-size: 12px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--dv-border-l2);
  white-space: nowrap;
}
.dv-table td {
  padding: 8px;
  border-bottom: 1px solid var(--dv-border-l1);
  vertical-align: top;
}
.dv-table tr:last-child td {
  border-bottom: 0;
}
.dv-th-right,
.dv-td-right {
  text-align: right;
}

.dv-path {
  overflow-wrap: anywhere;
  word-break: break-all;
}

/* Per-item conflict row (restore). */
.dv-conflict-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--dv-border-l2);
  min-width: 0;
}
.dv-conflict-row:last-child {
  border-bottom: 0;
}
.dv-conflict-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.dv-conflict-path {
  font-family: var(--dv-mono);
  font-size: 12px;
  color: var(--dv-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
  min-width: 0;
}

/* ==========================================================================
   Progress
   ========================================================================== */

.dv-progress {
  position: relative;
  height: 4px;
  border-radius: 999px;
  background: var(--dv-bg-skeleton);
  overflow: hidden;
}
.dv-progress > span {
  display: block;
  height: 100%;
  background: var(--dv-text);
  border-radius: inherit;
  transition: width 0.2s ease;
}
.dv-progress[data-indeterminate='true'] > span {
  width: 35%;
  animation: dv-indeterminate 1.2s ease-in-out infinite;
}
@keyframes dv-indeterminate {
  from { transform: translateX(-100%); }
  to { transform: translateX(300%); }
}

.dv-progress-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--dv-text-tertiary);
  margin-bottom: 6px;
}

.dv-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.5px solid var(--dv-border-l3);
  border-top-color: var(--dv-text-secondary);
  animation: dv-spin 0.8s linear infinite;
  flex: none;
}
@keyframes dv-spin {
  to { transform: rotate(360deg); }
}

.dv-loading-inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--dv-text-tertiary);
}

.dv-skeleton {
  height: 12px;
  border-radius: var(--dv-radius-xs);
  background: var(--dv-bg-skeleton);
  animation: dv-pulse 1.4s ease-in-out infinite;
}
@keyframes dv-pulse {
  50% { opacity: 0.5; }
}

/* Empty / error states \u2014 plain text, no illustration. */
.dv-state {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dv-text-secondary);
}
.dv-state-title {
  font-size: 14px;
  color: var(--dv-text);
}
.dv-state[data-tone='error'] .dv-state-title {
  color: var(--dv-danger);
}
.dv-state-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

/* ==========================================================================
   Details
   ========================================================================== */

.dv-details {
  border-radius: var(--dv-radius-md);
}
.dv-details > summary {
  list-style: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--dv-text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
}
.dv-details > summary::-webkit-details-marker {
  display: none;
}
.dv-details > summary::before {
  content: '';
  width: 5px;
  height: 5px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(-45deg);
  transition: transform 0.12s ease;
}
.dv-details[open] > summary::before {
  transform: rotate(45deg);
}
.dv-details-body {
  padding: 4px 0 8px 13px;
  font-size: 13px;
  color: var(--dv-text-secondary);
}

/* ==========================================================================
   Dialog (confirmation only \u2014 the host owns the settings modal frame)
   ========================================================================== */

.dv-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 16px;
  /* --dsw-alias-bg-overlay is an opaque surface color (#e9ecf2), not a scrim: it hid
     the whole Settings modal behind vault dialogs. mask-drop is the host's translucent wash. */
  background: var(--dsw-alias-bg-mask-drop, rgb(0 0 0 / 0.32));
}

.dv-dialog {
  width: min(400px, 100%);
  background: var(--dv-bg-layer-1);
  border-radius: var(--dv-radius-xl);
  border: 1px solid var(--dv-border-l2);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  outline: none;
}

.dv-dialog-title {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 400;
  color: var(--dv-text);
}

.dv-dialog-desc {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dv-text-secondary);
  overflow-wrap: anywhere;
}

.dv-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dv-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.dv-kv {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0;
  font-size: 13px;
}
.dv-kv dt {
  color: var(--dv-text-tertiary);
}
.dv-kv dd {
  margin: 0;
  color: var(--dv-text);
  min-width: 0;
  overflow-wrap: anywhere;
}

@media (prefers-reduced-motion: reduce) {
  .dsh-vault-root *,
  .dsh-vault-root *::before,
  .dsh-vault-root *::after {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
  }
}

/* ==========================================================================
   Path browser (Browse\u2026 dialog)
   ========================================================================== */

.dv-dialog[data-size='wide'] {
  width: min(560px, 100%);
  max-height: calc(100vh - 32px);
}

.dv-picker-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin: 0;
}
.dv-picker-bar .dv-input {
  flex: 1;
  min-width: 0;
}

.dv-picker-list {
  display: flex;
  flex-direction: column;
  height: 300px;
  overflow-y: auto;
  border: 1px solid var(--dv-border-l2);
  border-radius: var(--dv-radius-sm);
  padding: 4px;
  background: var(--dv-bg-layer-1);
}

.dv-picker-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 32px;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--dv-radius-xs);
  background: transparent;
  color: var(--dv-text);
  font-size: 13px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
}
.dv-picker-item:hover:not(:disabled) {
  background: var(--dv-bg-module);
}
.dv-picker-item[data-selected='true'] {
  background: var(--dv-bg-selected);
}
.dv-picker-item:disabled {
  cursor: default;
  color: var(--dv-text-caption);
}
.dv-picker-item[data-hidden='true'] .dv-picker-name {
  color: var(--dv-text-tertiary);
}

.dv-picker-icon {
  display: inline-flex;
  flex: none;
  font-size: 16px;
  color: var(--dv-text-secondary);
}

.dv-picker-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dv-picker-size {
  flex: none;
  font-size: 12px;
  color: var(--dv-text-tertiary);
}

.dv-picker-empty {
  padding: 24px 8px;
  text-align: center;
  font-size: 13px;
  color: var(--dv-text-tertiary);
}

.dv-picker-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

/* Restore results: raw installer log, collapsed under \u8BE6\u60C5 */
.dsh-vault-root .dv-details {
  margin-top: 4px;
  font-size: 12px;
  color: var(--dv-text-tertiary);
}
.dsh-vault-root .dv-details > summary {
  cursor: pointer;
  width: fit-content;
  user-select: none;
}
.dsh-vault-root .dv-details > summary:focus-visible {
  outline: var(--dv-focus-width) solid var(--dv-focus);
  outline-offset: 2px;
  border-radius: var(--dv-radius-xs);
}
.dsh-vault-root .dv-log {
  margin: 6px 0 0;
  padding: 8px 10px;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: var(--dv-mono);
  font-size: 11px;
  line-height: 1.5;
  border: 1px solid var(--dv-border-l1);
  border-radius: var(--dv-radius-sm);
  background: var(--dv-bg-module);
  color: var(--dv-text-secondary);
}

/* Restore preview: collapsible groups (native list look, no decoration) */
.dsh-vault-root .dv-diff-groups { display: flex; flex-direction: column; gap: 8px; }
.dsh-vault-root .dv-diff-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-vault-root .dv-diff-toggle { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.dsh-vault-root .dv-diff-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--dv-border-l1); border-radius: 8px; overflow: hidden; }
.dsh-vault-root .dv-diff-group + .dv-diff-group { border-top: 1px solid var(--dv-border-l1); }
.dsh-vault-root .dv-diff-head { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 12px; cursor: pointer; color: var(--dv-text); font-size: 13px; }
.dsh-vault-root .dv-diff-head:hover { background: var(--dv-bg-module); }
.dsh-vault-root .dv-diff-head:focus-visible { outline: 2px solid var(--dv-border-l4); outline-offset: -2px; }
.dsh-vault-root .dv-diff-chevron { width: 12px; color: var(--dv-text-tertiary); font-size: 11px; }
.dsh-vault-root .dv-diff-title { font-weight: 500; flex: 0 0 auto; }
.dsh-vault-root .dv-diff-body { display: flex; flex-direction: column; gap: 2px; padding: 4px 12px 10px 32px; }
.dsh-vault-root .dv-diff-row { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 8px; align-items: baseline; padding: 3px 0; font-size: 12px; }
.dsh-vault-root .dv-diff-row .dv-path { overflow-wrap: anywhere; }
.dsh-vault-root .dv-diff-badge { color: var(--dv-text-tertiary); font-size: 12px; }
.dsh-vault-root .dv-diff-row[data-change="add"] .dv-diff-badge { color: var(--dv-ok-label); }
.dsh-vault-root .dv-diff-row[data-change="change"] .dv-diff-badge { color: var(--dv-warn); }
.dsh-vault-root .dv-result-list { margin: 6px 0 0; padding-left: 18px; }
.dsh-vault-root .dv-result-list li { overflow-wrap: anywhere; }

/* Job progress (thin native bar) + restart notice */
.dsh-vault-root .dv-job { margin: 0 0 12px; padding: 10px 12px; border: 1px solid var(--dv-border-l1); border-radius: 8px; background: var(--dv-bg-layer-2); }
.dsh-vault-root .dv-restart-notice { margin: 8px 0 0; font-weight: 500; color: var(--dv-text); }
`;
var tagId = "dsh-vault/theme.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-vault";
  tag.dataset.pluginCss = tagId;
  tag.textContent = css;
  document.head.appendChild(tag);
}

// src/client/VaultApp.tsx
var import_jsx_runtime14 = require("react/jsx-runtime");
var TABS = ["overview", "backup", "restore", "storage", "snapshots", "schedule"];
function VaultApp({ api: apiProp, hostLocale, initialTab = "overview" }) {
  const api = (0, import_react12.useMemo)(() => apiProp ?? new VaultApi(), [apiProp]);
  const fsBrowser = (0, import_react12.useMemo)(() => ({
    list: (path) => api.listFs(path),
    mkdir: (path, name2) => api.mkdir(path, name2),
    pickNative: () => api.pickDirectory()
  }), [api]);
  const locale = (0, import_react12.useMemo)(() => hostLocale ? normalizeLocale(hostLocale) : detectInitialLocale(), [hostLocale]);
  const t = (0, import_react12.useMemo)(
    () => (key, vars) => translate(locale, key, vars),
    [locale]
  );
  const errorText2 = (0, import_react12.useCallback)((err) => localizeError(err, t), [t]);
  const [tab, setTab] = (0, import_react12.useState)(initialTab);
  const [status, setStatus] = (0, import_react12.useState)(null);
  const [snapshots, setSnapshots] = (0, import_react12.useState)([]);
  const [preview, setPreview] = (0, import_react12.useState)(null);
  const [restoreResult, setRestoreResult] = (0, import_react12.useState)(null);
  const [lastBackup, setLastBackup] = (0, import_react12.useState)(null);
  const [retrying, setRetrying] = (0, import_react12.useState)(false);
  const [loading, setLoading] = (0, import_react12.useState)(true);
  const [busy, setBusy] = (0, import_react12.useState)(false);
  const [snapshotsReliable, setSnapshotsReliable] = (0, import_react12.useState)(true);
  const [error, setError] = (0, import_react12.useState)(null);
  const [notice, setNotice] = (0, import_react12.useState)(null);
  const [backupTargetId, setBackupTargetId] = (0, import_react12.useState)(void 0);
  const [restorePreset, setRestorePreset] = (0, import_react12.useState)(null);
  const [job, setJob] = (0, import_react12.useState)(null);
  const pollTimer = (0, import_react12.useRef)(null);
  const restoreResultRef = (0, import_react12.useRef)(null);
  restoreResultRef.current = restoreResult;
  const jobDone = (0, import_react12.useRef)(null);
  const followJob = (0, import_react12.useCallback)((first, onDone) => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    jobDone.current = onDone;
    setJob(first);
    setBusy(true);
    const tick = async (id) => {
      try {
        const { job: j } = await api.getJob(id);
        if (!j) throw new Error("job lost");
        setJob(j);
        if (j.status === "running") {
          pollTimer.current = setTimeout(() => void tick(id), 500);
          return;
        }
        setBusy(false);
        setRetrying(false);
        setJob(null);
        if (j.status === "error") setError(j.error?.message ?? "failed");
        else await jobDone.current?.(j);
      } catch (err) {
        pollTimer.current = setTimeout(() => void tick(id), 1500);
        if (err instanceof Error && /not found/.test(err.message)) {
          setBusy(false);
          setRetrying(false);
          setJob(null);
          if (pollTimer.current) clearTimeout(pollTimer.current);
        }
      }
    };
    if (first.status === "running") pollTimer.current = setTimeout(() => void tick(first.id), 400);
    else void tick(first.id);
  }, [api]);
  const refresh = (0, import_react12.useCallback)(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await api.status();
      setStatus(s);
      try {
        const snap = await api.listSnapshots();
        setSnapshots(snap.snapshots);
        setSnapshotsReliable(true);
      } catch (snapErr) {
        setSnapshotsReliable(false);
        setError(errorText2(snapErr));
      }
    } catch (err) {
      setError(errorText2(err));
    } finally {
      setLoading(false);
    }
  }, [api]);
  const showRestoreOutcome = async (r, isRetry) => {
    const failed = (r.pluginResults ?? []).some((row) => row.status === "failed") || r.ok === false;
    const parts = [];
    if (!isRetry) {
      parts.push(failed ? t("restore.partialBody", { applied: r.applied.length, skipped: r.skipped.length }) : t("restore.successBody", { applied: r.applied.length, skipped: r.skipped.length }));
      if (r.rollbackSnapshotId) parts.push(t("restore.rollbackCreated", { id: r.rollbackSnapshotId }));
    }
    if (failed) parts.push(t("restore.pluginsFailed", { list: failedPluginLabels(r.pluginResults, r.pluginsFailed) }));
    else if (!r.pluginResults?.length && r.pluginsReinstalled.length) {
      parts.push(t("restore.pluginsReinstalled", { list: [...new Set(r.pluginsReinstalled)].join("\u3001") }));
    }
    if (r.restartRequired) parts.push(t("restore.restartRequired"));
    for (const m of r.manualActions) {
      if (r.pluginResults?.some((row) => m.startsWith(`${row.name} (`))) continue;
      if (r.restartRequired && /^Restart /.test(m)) continue;
      if (r.pluginResults?.length && /^Some plugins used local link:\/file: sources/.test(m)) continue;
      parts.push(localizeNotice(m, t));
    }
    const text = [...new Set(parts)].join(" \xB7 ");
    setNotice({ kind: failed ? "error" : "ok", text });
    await refresh();
  };
  (0, import_react12.useEffect)(() => {
    void refresh();
  }, [api]);
  (0, import_react12.useEffect)(() => () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);
  const run = (0, import_react12.useCallback)(async (fn) => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(errorText2(err));
      return void 0;
    } finally {
      setBusy(false);
    }
  }, []);
  const targets = status?.targets ?? [];
  const settings = status?.settings ?? null;
  const targetLabel = (0, import_react12.useCallback)((id) => targetName(targets.find((x) => x.id === id), t, id), [targets, t]);
  const navigate = (0, import_react12.useCallback)((next) => {
    setTab(next);
    setError(null);
    setNotice(null);
    if (next !== "restore") setPreview(null);
  }, []);
  const tabItems = (0, import_react12.useMemo)(
    () => TABS.map((id) => ({ id, label: t(`section.tab.${id}`), panelId: `dv-panel-${id}` })),
    [t]
  );
  const showOutcomeRef = (0, import_react12.useRef)(showRestoreOutcome);
  showOutcomeRef.current = showRestoreOutcome;
  const finishBackup = (0, import_react12.useCallback)(async (j) => {
    setLastBackup(j.result);
    await refresh();
  }, [refresh]);
  const finishRestore = (0, import_react12.useCallback)(async (j) => {
    const r = j.result;
    setRestoreResult(r);
    setPreview(null);
    await showOutcomeRef.current(r, false);
  }, []);
  const finishRetry = (0, import_react12.useCallback)(async (j) => {
    const r = j.result;
    const prev = restoreResultRef.current;
    const merged = new Map((prev?.pluginResults ?? []).map((row) => [`${row.profile}:${row.name}`, row]));
    for (const row of r.pluginResults ?? []) merged.set(`${row.profile}:${row.name}`, row);
    const rows = [...merged.values()];
    const next = {
      ...prev ?? r,
      pluginResults: rows,
      pluginsFailed: rows.filter((row) => row.status === "failed").map((row) => row.name),
      pluginsReinstalled: rows.filter((row) => row.status === "installed" || row.status === "installed-from-backup").map((row) => row.name),
      restartRequired: Boolean(prev?.restartRequired || r.restartRequired),
      ok: rows.every((row) => row.status !== "failed"),
      manualActions: r.manualActions
    };
    setRestoreResult(next);
    await showOutcomeRef.current(next, true);
  }, []);
  (0, import_react12.useEffect)(() => {
    let alive = true;
    api.getJob().then(({ job: j }) => {
      if (!alive || !j || j.status !== "running") return;
      if (j.kind === "retry-plugins") setRetrying(true);
      followJob(j, j.kind === "backup" ? finishBackup : j.kind === "restore" ? finishRestore : finishRetry);
    }).catch(() => {
    });
    return () => {
      alive = false;
    };
  }, [api]);
  const backupTo = (0, import_react12.useCallback)((input) => {
    setError(null);
    setNotice(null);
    setLastBackup(null);
    setBusy(true);
    void api.startBackupJob(input).then((j) => followJob(j, finishBackup)).catch((err) => {
      if (err instanceof VaultApiError && err.code === "EXPORT_EXISTS" && !input.overwrite && typeof window !== "undefined" && window.confirm(t("backup.overwriteConfirm"))) {
        backupTo({ ...input, overwrite: true });
        return;
      }
      setBusy(false);
      setError(errorText2(err));
    });
  }, [api, followJob, finishBackup, t]);
  const i18nValue = (0, import_react12.useMemo)(() => ({ locale, t }), [locale, t]);
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(I18nContext.Provider, { value: i18nValue, children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "dsh-vault-root", lang: locale === "zh" ? "zh-CN" : "en", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "dv-section", children: [
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(SectionHead, { title: t("section.title"), description: t("section.description"), id: "dv-section-title" }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(SectionTabs, { label: t("section.tabs"), value: tab, onChange: navigate, items: tabItems }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("main", { tabIndex: -1, className: "dv-section-body", children: [
      job ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(JobProgress, { job }) : null,
      status?.unfinishedRestore ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
        Banner,
        {
          tone: "error",
          role: "alert",
          title: t("unfinished.title"),
          actions: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
            status.unfinishedRestore.rollbackSnapshotId ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
              Button,
              {
                variant: "danger",
                disabled: busy,
                onClick: () => {
                  const u = status.unfinishedRestore;
                  setRestorePreset({ targetId: u.rollbackTargetId ?? "local-rollback", snapshotId: u.rollbackSnapshotId, nonce: Date.now() });
                  setPreview(null);
                  navigate("restore");
                },
                children: t("unfinished.rollback")
              }
            ) : null,
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
              Button,
              {
                disabled: busy,
                onClick: () => {
                  void api.dismissUnfinishedRestore().then(() => refresh(), () => refresh());
                },
                children: t("unfinished.dismiss")
              }
            )
          ] }),
          children: [
            t(status.unfinishedRestore.rollbackSnapshotId ? "unfinished.body" : "unfinished.bodyNoRollback", {
              snapshot: status.unfinishedRestore.snapshotId,
              time: formatDateTime(status.unfinishedRestore.startedAt, locale)
            }),
            status.unfinishedRestore.rollbackEncrypted ? " " + t("unfinished.encrypted") : ""
          ]
        }
      ) : null,
      tab === "overview" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
        Overview,
        {
          status,
          loading,
          error,
          snapshots: snapshotsReliable ? snapshots : void 0,
          onRefresh: () => void refresh(),
          onBackup: () => navigate("backup"),
          onBackupNow: () => {
            const targetId = settings?.defaultTargetId && targets.some((x) => x.id === settings.defaultTargetId) ? settings.defaultTargetId : targets[0]?.id;
            if (!targetId) {
              navigate("storage");
              return;
            }
            backupTo({
              targetId,
              encrypt: Boolean(targets.find((x) => x.id === targetId)?.encryptByDefault),
              includeSecrets: false
            });
          },
          backupBusy: busy,
          onNavigate: navigate,
          message: notice?.kind === "ok" ? notice.text : null
        }
      ) : null,
      tab === "backup" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
        BackupPanel,
        {
          targets,
          busy,
          message: notice?.kind === "ok" ? notice.text : null,
          error,
          defaultTargetId: backupTargetId ?? settings?.defaultTargetId,
          onBackup: backupTo,
          onNavigateStorage: () => navigate("storage"),
          fs: fsBrowser,
          pluginDataEntries: status?.pluginDataEntries,
          copiesApi: api,
          result: lastBackup,
          resultLocation: lastBackup ? lastBackup.exportPath ?? targetLabel(lastBackup.targetId) : ""
        },
        backupTargetId ?? "default"
      ) : null,
      tab === "restore" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
        RestorePanel,
        {
          targets,
          snapshots: snapshotsReliable ? snapshots : [],
          preview,
          busy,
          message: notice?.kind === "ok" ? notice.text : null,
          error,
          loading,
          initialTargetId: restorePreset?.targetId,
          initialSnapshotId: restorePreset?.snapshotId,
          archiveLimitBytes: status?.archiveLimitBytes,
          onSourceChange: () => {
            setNotice(null);
            setError(null);
            setRestoreResult(null);
            setPreview(null);
          },
          onNavigateStorage: () => navigate("storage"),
          onPreview: (input) => {
            setBusy(true);
            setError(null);
            setNotice(null);
            setPreview(null);
            void api.previewRestore(input.targetId, input.snapshotId, input.password, input.conflict, input.conflicts, input.importPath).then(setPreview).catch((err) => setError(errorText2(err))).finally(() => setBusy(false));
          },
          result: restoreResult,
          retrying,
          onRetryFailed: () => {
            const failedRows = (restoreResult?.pluginResults ?? []).filter((row) => row.status === "failed");
            setRetrying(true);
            setError(null);
            setNotice(null);
            void api.startRetryPluginsJob(failedRows.map((row) => ({ name: row.name, profile: row.profile }))).then((j) => followJob(j, finishRetry)).catch((err) => {
              setRetrying(false);
              setError(errorText2(err));
            });
          },
          onRestore: (input) => {
            setRestoreResult(null);
            setBusy(true);
            setError(null);
            setNotice(null);
            void api.startRestoreJob(input).then((j) => followJob(j, finishRestore)).catch((err) => {
              setBusy(false);
              setError(errorText2(err));
            });
          },
          fs: fsBrowser
        },
        restorePreset?.nonce ?? "restore"
      ) : null,
      tab === "storage" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
        StoragePanel,
        {
          fs: fsBrowser,
          targets,
          busy,
          error,
          message: notice?.kind === "ok" ? notice.text : null,
          loading,
          snapshots: snapshotsReliable ? snapshots : [],
          testConnection: async (target) => {
            try {
              const r = await api.listSnapshots(target.id);
              return { ok: true, count: r.snapshots.length };
            } catch (err) {
              return { ok: false, error: errorText2(err) };
            }
          },
          onUpsert: (target) => {
            void run(async () => {
              await api.upsertTarget(target);
              setNotice({ kind: "ok", text: t("storage.saved", { label: targetName(target, t) }) });
              await refresh();
            });
          },
          onDelete: (id) => {
            const label = targetLabel(id);
            void run(async () => {
              await api.deleteTarget(id);
              setNotice({ kind: "ok", text: t("storage.deleted", { label }) });
              await refresh();
            });
          }
        }
      ) : null,
      tab === "snapshots" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
        SnapshotsPanel,
        {
          snapshots: snapshotsReliable ? snapshots : [],
          busy,
          loading,
          error,
          message: notice?.kind === "ok" ? notice.text : null,
          targets,
          onRefresh: () => void refresh(),
          onNavigateBackup: () => navigate("backup"),
          onRestoreRequest: (targetId, snapshotId) => {
            setRestorePreset({ targetId, snapshotId, nonce: Date.now() });
            setPreview(null);
            navigate("restore");
          },
          onDelete: (targetId, snapshotId) => {
            void run(async () => {
              await api.deleteSnapshot(targetId, snapshotId);
              setNotice({ kind: "ok", text: t("snapshots.deleted", { id: snapshotId }) });
              if (preview?.snapshotId === snapshotId) setPreview(null);
              await refresh();
            });
          },
          onVerify: async (targetId, snapshotId, password) => {
            try {
              await api.verify(targetId, snapshotId, password);
              setNotice({ kind: "ok", text: t("snapshots.verifyOk") });
              return { ok: true };
            } catch (err) {
              return { ok: false, error: errorText2(err) };
            }
          }
        }
      ) : null,
      tab === "schedule" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
        SettingsPanel,
        {
          settings,
          busy,
          loading,
          error,
          message: notice?.kind === "ok" ? notice.text : null,
          targets,
          locale,
          onRetry: () => void refresh(),
          onSave: (patch) => {
            void run(async () => {
              const s = await api.updateSettings(patch);
              setStatus((prev) => prev ? { ...prev, settings: s } : prev);
              setNotice({ kind: "ok", text: t("schedule.saved") });
            });
          },
          onRunSchedule: () => {
            void run(async () => {
              const r = await api.runSchedule();
              setNotice({
                kind: "ok",
                text: r.result ? t("schedule.runDone", { id: r.result.snapshotId }) : t("schedule.runSkipped")
              });
              await refresh();
            });
          }
        }
      ) : null
    ] })
  ] }) }) });
}

// src/client/index.ts
var name = "dsh-vault-client";
var inject = ["slots", "locale"];
var NS = "dsh-vault";
var zh2 = { ...dictionaries.zh, "section.label": "\u5927\u80A5\u9C7C\u5907\u4EFD" };
var en2 = { ...dictionaries.en, "section.label": "\u5927\u80A5\u9C7C\u5907\u4EFD" };
function currentLocale(ctx) {
  try {
    return ctx.locale.getLocale?.().active;
  } catch {
    return void 0;
  }
}
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh: zh2, en: en2 }), "dsh-vault:locale");
  const t = ctx.locale.bind(NS);
  const api = new VaultApi();
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "dsh-vault",
    order: 65,
    label: () => t("section.label"),
    locale: NS,
    inject: () => ({ api })
  }, createVaultSection(ctx)));
}
function VaultSection(props) {
  return (0, import_react13.createElement)(VaultApp, { api: props.api, hostLocale: props.locale });
}
function createVaultSection(ctx) {
  return (props) => (0, import_react13.createElement)(VaultApp, { api: props.api, hostLocale: currentLocale(ctx) });
}

		return module.exports;
	}
});
