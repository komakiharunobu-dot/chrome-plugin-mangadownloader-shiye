"use strict";
const $ = id => document.getElementById(id);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const freshChapter = () => ({schema:2, rows:[], title:"", sourceUrl:"", origin:"", format:"png", delivery:"zip", limit:100});
let state = freshChapter(), tabId = null, windowId = null, binding = 0, busy = false, stopping = false;
let otherVisible = false, retry = null, clearUntil = 0, cacheWarning = false, lastJoin = null;
const hotBlobs = new Map();
let saveChain = Promise.resolve();

function message(text, error = false) {
  $("status").textContent = text;
  $("status").parentElement.className = "statusbar" + (error ? " error" : busy ? " working" : "");
}
function failure(error) {
  let text = String(error?.message || error || "未知错误");
  if (/Cannot access|Missing host permission|extensions gallery|chrome:\/\/|not allowed on|can't be scripted/i.test(text))
    return "请打开漫画网站的章节页，并在那张标签页上点一次拾页图标。";
  if (/No tab|Invalid tab|tab was closed/i.test(text)) return "漫画标签页已经关闭。";
  if (/Failed to fetch|NetworkError|Load failed/i.test(text)) return "图片服务器拒绝读取，或图源已过期";
  if (/timeout|timed out|aborted/i.test(text)) return "读取超时，请检查网络后重试";
  return text.slice(0, 180);
}
function checkpoint(blobs = []) {
  const id = tabId, snapshot = structuredClone(state);
  for (const [key, blob] of blobs) hotBlobs.set(key, blob);
  const toWrite = Array.from(hotBlobs);
  saveChain = saveChain.catch(() => {}).then(async () => {
    try {
      await ShiyeDB.save(id, snapshot, toWrite);
      if (id === tabId) {
        for (const [key, blob] of toWrite) if (hotBlobs.get(key) === blob) hotBlobs.delete(key);
        cacheWarning = false;
      }
    } catch { if (id === tabId) cacheWarning = true; }
  });
  return saveChain;
}
function setControls() {
  const selected = state.rows.filter(r => r.selected).length;
  for (const id of ["scan","scroll","turn","limit","format","delivery","title","clear","select","none","other","join-direction"])
    $(id).disabled = busy || tabId === null;
  $("stop").hidden = !busy; $("stop").disabled = stopping;
  $("export").disabled = busy || !selected;
  $("export").textContent = selected ? "导出 " + selected + " 张图片" : "导出所选图片";
  $("retry").disabled = busy;
  $("join").disabled = busy || selected < 2;
  $("unjoin").disabled = busy;
  $("unjoin").hidden = !lastJoin;
  $("count").textContent = "已选 " + selected + " 张";
  $("formathint").textContent = state.format === "png" ? "PNG 保留透明背景。同格式的原图直接保存。" : "JPG 使用白色背景，转换质量为 92%。已有 JPG 原图直接保存。";
  for (const el of $("list").querySelectorAll("input,button")) {
    el.disabled = busy || el.dataset.boundary === "1";
  }
}
function putText(tag, text, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text; return el;
}
function draw() {
  const rows = state.rows, others = rows.filter(r => !r.good).length;
  const visible = rows.filter(r => r.good || r.selected || otherVisible);
  $("other").hidden = !others;
  $("other").textContent = otherVisible ? "收起其他图" : "其他图片 (" + others + ")";
  $("source").textContent = state.sourceUrl ? new URL(state.sourceUrl).hostname + " · " + (state.title || "当前章节") : "在漫画章节页点工具栏中的「拾页」，再开始扫描。";
  $("title").value = state.title; $("format").value = state.format; $("delivery").value = state.delivery; $("limit").value = state.limit;
  $("blank").hidden = !!visible.length;
  if (!visible.length) {
    $("blank").firstElementChild.textContent = others ? "没有自动勾选的漫画页" : "这里会显示收集到的图片";
    $("blank").lastElementChild.textContent = others ? "点「其他图片」查看小图或手动选择。" : "按阅读顺序排列，可取消勾选封面、广告或重复页。";
  }
  const fragment = document.createDocumentFragment();
  visible.forEach((row, i) => {
    const li = document.createElement("li"); li.className = "row";
    const choose = document.createElement("input"); choose.type = "checkbox"; choose.checked = row.selected;
    choose.setAttribute("aria-label", "选择候选图 " + (i + 1));
    choose.onchange = () => { row.selected = choose.checked; checkpoint(); draw(); };
    const box = putText("button", String(i + 1).padStart(2, "0"), "thumb");
    box.title = "放大预览"; box.setAttribute("aria-label", "预览候选图 " + (i + 1));
    box.onclick = () => openPreview(row, i + 1);
    const url = row.preview || row.previewUrl;
    if (url) {
      const im = new Image(); im.alt = ""; im.loading = "lazy"; im.referrerPolicy = "no-referrer";
      im.onerror = () => { im.remove(); box.textContent = String(i + 1).padStart(2, "0"); };
      box.replaceChildren(im); im.src = url;
    }
    const desc = document.createElement("div");
    desc.append(putText("div", "候选图 " + String(i + 1).padStart(2, "0"), "row-name"));
    const label = row.kind === "page" ? (row.complete ? "整页 · " + row.parts.length + " 块" : "分块未齐") : row.kind === "canvas" ? "画布" : row.kind === "background" ? "背景图" : row.good ? "页面图" : "其他图";
    desc.append(putText("div", (row.w && row.h ? row.w + " × " + row.h : "尺寸待读取") + " · " + label, "row-detail"));
    if (row.needsRescan) desc.append(putText("div", "旧版记录 · 需重新扫描", "row-detail"));
    if (row.localError) desc.append(putText("div", "临时图源待重新追加", "row-detail"));
    const arrows = document.createElement("div"); arrows.className = "arrows";
    for (const delta of [-1, 1]) {
      const b = putText("button", delta < 0 ? "↑" : "↓", "arrow");
      b.title = delta < 0 ? "上移" : "下移"; b.setAttribute("aria-label", b.title + "候选图 " + (i + 1));
      const neighbor = visible[i + delta]; b.dataset.boundary = neighbor ? "0" : "1";
      b.onclick = () => {
        if (!neighbor || busy) return;
        const a = rows.indexOf(row), z = rows.indexOf(neighbor);
        [rows[a], rows[z]] = [rows[z], rows[a]];
        checkpoint(); draw();
      };
      arrows.append(b);
    }
    li.append(choose,box,desc,arrows); fragment.append(li);
  });
  $("list").replaceChildren(fragment); setControls();
}
let viewToken = 0, viewObject = "";
function resetPreview() {
  viewToken++; $("viewimage").onerror = null; $("viewimage").removeAttribute("src");
  if (viewObject) URL.revokeObjectURL(viewObject);
  viewObject = "";
}
async function openPreview(row, number) {
  resetPreview();
  const token = viewToken, im = $("viewimage");
  $("viewtitle").textContent = "候选图 " + number; $("viewnote").textContent = "";
  if (!$("viewer").open) $("viewer").showModal();
  function fallback() {
    if (token !== viewToken) return;
    im.onerror = null;
    if (row.preview) { im.src = row.preview; $("viewnote").textContent = "当前显示的是网页缩略图。"; }
    else { im.removeAttribute("src"); $("viewnote").textContent = "当前图源未提供可用预览。导出时会再读取原图。"; }
  }
  try {
    if (row.kind === "page" && !row.complete) {
      $("viewnote").textContent = row.layout.issue;
      return;
    }
    if (row.local) {
      const blob = row.cached && (hotBlobs.get(row.key) || await ShiyeDB.blob(tabId, row.key).catch(() => null)) || await pageBlob(row);
      if (token !== viewToken) return;
      viewObject = URL.createObjectURL(blob);
    }
    im.onerror = fallback; im.referrerPolicy = "no-referrer";
    const src = viewObject || row.urls[0] || row.preview;
    if (src) im.src = src; else fallback();
  } catch { fallback(); }
}
$("viewer").onclose = resetPreview;
$("closeview").onclick = () => $("viewer").close();
async function bindActive() {
  if (busy) return;
  const serial = ++binding;
  const [tab] = await chrome.tabs.query({active:true, windowId});
  if (serial !== binding || busy || !tab || tab.id === tabId) return;
  await saveChain;
  let old;
  try { old = await ShiyeDB.chapter(tab.id); } catch {}
  if (serial !== binding || busy) return;
  if ($("viewer").open) $("viewer").close();
  tabId = tab.id; state = old || freshChapter();
  const outdated = state.schema !== 2 && state.rows.length > 0;
  if (outdated) for (const row of state.rows) row.needsRescan = true;
  state.schema = 2;
  otherVisible = false; retry = null;
  hotBlobs.clear(); cacheWarning = false; clearUntil = 0; lastJoin = null;
  $("report").replaceChildren(); $("extra").replaceChildren(); $("retry").hidden = true; $("clear").textContent = "清空";
  draw(); message(outdated ? "旧版列表需要重新扫描，以确认每一页完整。" : state.rows.length ? "已恢复这个标签页的收集列表。" : "准备就绪");
}
async function operate(task) {
  if (busy || tabId === null) return;
  busy = true; stopping = false; ++binding; setControls();
  try { await task(); }
  catch (error) { message(failure(error), true); }
  finally {
    busy = false; stopping = false; $("progress").hidden = true;
    $("status").parentElement.classList.remove("working");
    if (cacheWarning) $("status").append(" 本地缓存空间不足，请在关闭面板前导出。");
    setControls(); bindActive().catch(() => {});
  }
}
async function page(method, ...args) {
  const target = {tabId, frameIds:[0]};
  const call = () => chrome.scripting.executeScript({target, args:[method, args],
    func: async (name, params) => {
      if (globalThis.ShiyeReader?.version !== 2 || globalThis.ShiyeLayout?.version !== 2) return {missing:true};
      try { return {value: (await globalThis.ShiyeReader[name](...params)) ?? null}; }
      catch (e) { return {error:String(e?.message || e)}; }
    }});
  let result = (await call())[0]?.result;
  if (result?.missing) {
    await chrome.scripting.executeScript({target, files:["layout.js","reader.js"]});
    result = (await call())[0]?.result;
  }
  if (!result || result.missing) throw new Error("阅读器正在跳转，请稍后再试");
  if (result.error) throw new Error(result.error);
  return result.value;
}
async function pageBlob(row, url = "") {
  const meta = await page("prepare", row.key, url, row.origin);
  const chunks = [], size = 768 * 1024;
  try {
    for (let i = 0; i < meta.size; i += size) {
      const raw = atob(await page("part", meta.id, meta.docId, i, size));
      const bytes = new Uint8Array(raw.length);
      for (let j = 0; j < bytes.length; j++) bytes[j] = raw.charCodeAt(j);
      chunks.push(bytes);
    }
    const blob = new Blob(chunks, {type:meta.type});
    if (!blob.size || blob.size !== meta.size) throw new Error("图源传输不完整");
    return blob;
  } finally { await page("release", meta.id, meta.docId).catch(() => {}); }
}
async function scan() {
  const info = await page("scan", state.rows.filter(r => r.preview).map(r => r.key));
  if (state.origin && state.origin !== info.origin) throw new Error("此标签已切换站点，请先导出或清空上一章。");
  return info;
}
function scanNotes(info) {
  const block = $("extra"); block.replaceChildren();
  const pages = info.rows.filter(r => r.kind === "page");
  const pending = pages.filter(r => !r.complete).length;
  if (pages.length) block.append(putText("p", "已识别 " + pages.length + " 个分块页面" + (pending ? "，其中 " + pending + " 页尚未加载完整。请显示这些页面后再次扫描。" : "，按整页导出。")));
  if (info.blockedCanvases) block.append(putText("p", "有 " + info.blockedCanvases + " 个画布无法读取。"));
  if (info.frames.length && !info.rows.some(r => r.good)) {
    block.append(putText("p", "页面内含独立框架。如果漫画在其中，请打开对应框架，再点拾页。"));
    for (const url of info.frames.slice(0, 5)) {
      const a = putText("a", new URL(url).hostname + " ↗"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
      const p = document.createElement("p"); p.append(a); block.append(p);
    }
  }
}
async function merge(info) {
  if (!state.sourceUrl) { state.sourceUrl = info.href; state.origin = info.origin; }
  if (!state.title) state.title = info.title || new URL(info.href).hostname;
  const joinedMembers = new Set(state.rows.filter(r => r.manual).flatMap(r => r.members || []));
  info = {...info,rows:info.rows.filter(r => !joinedMembers.has(r.key))};
  const superseded = new Set(info.rows.flatMap(r => r.members || []));
  const previousCount = state.rows.length;
  state.rows = state.rows.filter(r => !superseded.has(r.key));
  const known = new Map(state.rows.map(r => [r.key, r])), blobs = [];
  let change = previousCount !== state.rows.length, added = 0;
  for (const found of info.rows) {
    let row = known.get(found.key);
    if (!row) {
      row = {...found, selected:found.good}; known.set(row.key, row); state.rows.push(row); added++; change = true;
    } else if (found.kind === "page") {
      if (row.complete && !found.complete) continue;
      if (row.revision !== found.revision) {
        const selected = row.selected;
        Object.assign(row,found,{selected,cached:false,localError:false});
        hotBlobs.delete(row.key);
        change = true;
      }
      row.needsRescan = false;
    } else if ((!row.preview && found.preview) || (!row.w && found.w) || (!row.good && found.good)) {
      if (found.preview) row.preview = found.preview;
      if (found.w) {row.w = found.w; row.h = found.h;}
      if (!row.good && found.good) {row.good = true; row.selected = true;}
      change = true;
    }
    if (row.needsRescan) { row.needsRescan = false; change = true; }
    if (found.local && !row.cached && (found.kind !== "page" || found.complete)) {
      try { blobs.push([row.key, await pageBlob(row)]); row.cached = true; row.localError = false; }
      catch { row.localError = true; }
      change = true;
    }
  }
  if (change || !state.rows.length) await checkpoint(blobs);
  scanNotes(info);
  return added;
}
function counts(prefix) {
  const selected = state.rows.filter(r => r.selected).length;
  return prefix + " 当前已选 " + selected + " 张，共发现 " + state.rows.length + " 张图片。";
}
async function manual() {
  message("正在识别页面图源…");
  const info = await scan(), n = await merge(info);
  draw(); message(counts(n ? "已追加 " + n + " 张候选图。" : state.rows.length ? "没有新的候选图。" : "当前未找到可读取的图片。"));
}
function recordPageOrder(order, known, rows) {
  // A later page may already be loaded when an earlier lazy image first appears.
  // Place newly revealed runs before their next known page in the same DOM scan.
  let run = [];
  for (const {key} of rows) {
    if (!known.has(key)) { run.push(key); continue; }
    if (run.length) {
      order.splice(order.indexOf(key), 0, ...run);
      for (const k of run) known.add(k);
      run = [];
    }
  }
  order.push(...run);
  for (const k of run) known.add(k);
}
async function scrollChapter() {
  const order = [], seen = new Set(), before = state.rows.length;
  let steps = 0, bottomPasses = 0, lastBottom = "", hitCap = false;
  message("正在定位阅读区域…");
  await page("startScroll");
  try {
    while (!stopping) {
      await pause(bottomPasses ? 780 : 370);
      const info = await scan();
      recordPageOrder(order, seen, info.rows);
      await merge(info);
      message("滚动收集中 · 已发现 " + state.rows.length + " 张候选图");
      if (stopping) break;
      const pos = await page("stepScroll");
      const marker = pos.height + "/" + pos.top + "/" + order.length;
      bottomPasses = pos.bottom ? (marker === lastBottom ? bottomPasses + 1 : 1) : 0;
      lastBottom = marker;
      if (bottomPasses >= 3) break;
      if (++steps >= 500) { hitCap = true; break; }
    }
  } finally {
    await page("endScroll").catch(() => {});
    if (order.length) {
      const map = new Map(state.rows.map(r => [r.key, r]));
      const first = state.rows.findIndex(r => seen.has(r.key));
      const rest = state.rows.filter(r => !seen.has(r.key));
      rest.splice(Math.max(0, first), 0, ...Array.from(order, k => map.get(k)).filter(Boolean));
      state.rows = rest;
    }
    await checkpoint(); draw();
  }
  message(counts((stopping ? "已停止。" : hitCap ? "达到单次滚动上限，请在余下位置手动追加。" : "已扫描到阅读区底部。") + " 新增 " + (state.rows.length - before) + " 张。"));
}
function chapterMark(url) {
  const u = new URL(url);
  const id = /(?:chapter|episode|chap|ch)[/_-]?(\d+(?:[.-]\d+)?)(?=[/?#_-]|$)/i.exec(u.pathname)?.[1] || "";
  return [u.origin, id, ...["chapter","chapter_id","chapterId","cid","episode","episodeId","episode_id"].map(k => u.searchParams.get(k) || "")].join("|");
}
async function turnChapter() {
  const max = state.limit;
  let info = await scan(), pages = 1;
  if (!info.rows.some(r => r.good)) throw new Error("当前没有可确认的漫画页。请等图片显示后重试，或手动追加。");
  const chapter = chapterMark(info.href);
  await merge(info); draw();
  let reason = "已达到设定的页数。";
  while (pages < max && !stopping) {
    message("自动翻页中 · 已收集 " + pages + " 个阅读器页面，最多 " + max + " 个");
    const old = new Set(info.rows.filter(r => r.good).map(r => r.key));
    const next = await page("nextPage");
    if (!next.ok) { reason = next.reason; break; }
    let changed = null, movedChapter = false, lastError = "";
    const deadline = Date.now() + 14000;
    while (Date.now() < deadline && !stopping) {
      await pause(480);
      try {
        const test = await scan();
        if (chapterMark(test.href) !== chapter) { movedChapter = true; break; }
        if (test.rows.some(r => r.good && !old.has(r.key))) { changed = test; break; }
      } catch (err) { lastError = failure(err); }
    }
    if (!changed) {
      reason = movedChapter ? "检测到章节变化，已停止收集。" : lastError || "没有识别到新漫画页，已停止。可手动翻页后追加。";
      break;
    }
    info = changed; await merge(info); pages++; draw();
  }
  message(counts((stopping ? "已停止。" : reason) + " 共收集 " + pages + " 个阅读器页面。"));
}
function requestedOrigins(plan) {
  const keys = new Set(plan.map(p => p.key));
  const hosts = new Set();
  for (const row of state.rows) {
    if (!keys.has(row.key) || (row.local && row.cached && !row.localFallback)) continue;
    for (const source of row.kind === "page" ? row.parts : [row]) {
      for (const value of source.urls) {
        const url = new URL(value);
        if (url.origin !== source.origin) hosts.add(url.protocol + "//" + url.hostname + "/*");
      }
    }
  }
  return Array.from(hosts);
}
async function remoteBlob(url, credentials = "omit") {
  const res = await fetch(url, {credentials, signal:AbortSignal.timeout(14000), cache:"default"});
  if (!res.ok) throw new Error("图源返回 HTTP " + res.status);
  const blob = await res.blob();
  if (!blob.size || /^(?:text\/|application\/(?:json|xhtml))/i.test(blob.type)) throw new Error("该地址返回了网页或空文件");
  return blob;
}
async function exported(row, format, permitted) {
  if (row.needsRescan) throw new Error("旧版记录需要重新扫描，确认整页后再导出");
  if (row.kind === "page") {
    if (!row.complete || row.layout.issue) throw new Error(row.layout.issue || "本页分块未齐");
    const cached = row.cached && (hotBlobs.get(row.key) || await ShiyeDB.blob(tabId,row.key).catch(() => null));
    if (cached) return {blob:await ShiyeExport.convert(cached,format),fallback:false};
    const blobs=[];
    for (const piece of row.parts) blobs.push((await exported(piece,"png",permitted)).blob);
    return {blob:await ShiyeExport.assemble(row.layout,blobs,format),fallback:false};
  }
  const errors = [];
  async function attempt(get) {
    try { return await ShiyeExport.convert(await get(), format); }
    catch (err) { errors.push(failure(err)); return null; }
  }
  async function captured() {
    const cached = hotBlobs.get(row.key) || await ShiyeDB.blob(tabId, row.key).catch(() => null);
    return cached && await attempt(() => cached) || await attempt(() => pageBlob(row));
  }
  if (row.local && !row.localFallback) {
    const blob = await captured();
    if (blob) return {blob, fallback:false};
  }
  for (const [index, url] of row.urls.entries()) {
    const u = new URL(url), external = u.origin !== row.origin;
    if (external && permitted) {
      const direct = await attempt(() => remoteBlob(url));
      if (direct) return {blob:direct, fallback:index > 0};
    }
    const fromPage = await attempt(() => pageBlob(row, url));
    if (fromPage) return {blob:fromPage, fallback:index > 0};
    if (!external || permitted) {
      const signedIn = await attempt(() => remoteBlob(url, "include"));
      if (signedIn) return {blob:signedIn, fallback:index > 0};
    }
  }
  if (row.localFallback) {
    const blob = await captured();
    if (blob) return {blob, fallback:true};
  }
  const unique = [...new Set(errors)];
  throw new Error(unique.slice(-3).join(" / ") || "请翻回这一页，等图片加载后重新追加");
}

function renderReport(saved, failed, skipped, dest, files, fallbacks) {
  const r = $("report"); r.replaceChildren();
  const parts = ["已保存 " + saved + " 张"];
  if (failed.length) parts.push(failed.length + " 张失败");
  if (skipped) parts.push(skipped + " 张未处理");
  r.append(putText("p", parts.join(" · ")));
  if (files.length) r.append(putText("p", (dest === "zip" ? "压缩包　" : "下载文件夹　") + files.join("、")));
  if (fallbacks.length) r.append(putText("p", "以下页面使用了备用图源，可核对清晰度　" + fallbacks.join("、")));
  if (failed.length) {
    const detail = document.createElement("details"); detail.open = true;
    detail.append(putText("summary", "失败页及原因"));
    const ul = document.createElement("ul");
    for (const f of failed) ul.append(putText("li", f.file + "　" + f.reason));
    detail.append(ul); r.append(detail);
  }
}
async function saveImages(plan, opts, permission, isRetry) {
  const permitted = await permission;
  const {format, delivery, folder} = opts;
  const rows = new Map(state.rows.map(r => [r.key, r]));
  const failed = [], files = [], fallbacks = [];
  let group = [], bytes = 0, part = 1, split = false, saved = 0, processed = 0;
  const progress = $("progress");
  progress.hidden = false; progress.max = plan.length; progress.value = 0;
  const fail = (item, error) => failed.push({key:item.key, file:item.file, reason:failure(error)});
  async function flush() {
    if (!group.length) return;
    const name = folder + (isRetry ? "_补图" : "") + (split ? "_" + String(part).padStart(2, "0") : "") + ".zip";
    message("正在保存 " + name + " · " + group.length + " 张，请留意 Chrome 下载提示…");
    try {
      await ShiyeExport.download(await ShiyeExport.zipGroup(group), name);
      saved += group.length; files.push(name);
    } catch (error) { for (const item of group) fail(item, error); }
    part++; group = []; bytes = 0;
  }
  for (const item of plan) {
    if (stopping) break;
    message("正在处理 " + (processed + 1) + "/" + plan.length + " · " + item.file);
    try {
      const row = rows.get(item.key);
      if (!row) throw new Error("这张图已从列表移除");
      const {blob, fallback} = await exported(row, format, permitted);
      if (fallback) fallbacks.push(item.file);
      if (delivery === "files") {
        await ShiyeExport.download(blob, folder + "/" + item.file); saved++;
      } else {
        if (group.length && bytes + blob.size > ShiyeExport.groupLimit) { split = true; await flush(); }
        group.push({...item, blob}); bytes += blob.size;
      }
    } catch (error) { fail(item, error); }
    processed++; progress.value = processed;
  }
  if (delivery === "zip") await flush();
  else if (saved) files.push(folder + "/");
  retry = failed.length ? {plan:failed.map(({key,file}) => ({key,file})), opts} : null;
  $("retry").hidden = !retry;
  const skipped = plan.length - processed;
  renderReport(saved, failed, skipped, delivery, files, fallbacks);
  message((stopping ? "已停止。" : "") + "已保存 " + saved + " 张" + (failed.length ? "，" + failed.length + " 张失败，可单独重试。" : "。"), !!failed.length);
}
function launchExport(isRetry = false) {
  if (busy || tabId === null) return;
  const opts = isRetry && retry ? retry.opts :
    {format:state.format, delivery:state.delivery, folder:ShiyeExport.safeName(state.title)};
  const plan = isRetry && retry ? retry.plan : ShiyeExport.makePlan(state.rows.filter(r => r.selected), opts.format);
  if (!plan.length) return;
  const hosts = requestedOrigins(plan);
  // permissions.request must start directly inside the user's click handler.
  const permission = hosts.length ? chrome.permissions.request({origins:hosts}).catch(() => false) : Promise.resolve(false);
  $("report").replaceChildren(); $("retry").hidden = true;
  operate(async () => { message("正在准备图源…"); await saveImages(plan, opts, permission, isRetry); });
}
function joinSelected() {
  if (busy) return;
  const pieces=state.rows.filter(r => r.selected);
  if (pieces.length<2) return;
  const hosts=requestedOrigins(pieces.map(r => ({key:r.key})));
  const permission=hosts.length ? chrome.permissions.request({origins:hosts}).catch(() => false) : Promise.resolve(false);
  const direction=$("join-direction").value || "vertical";
  operate(async () => {
    const permitted=await permission, blobs=[];
    for (const [i, row] of pieces.entries()) {
      if (stopping) { message("合并已停止。"); return; }
      message("正在读取分块 " + (i+1) + "/" + pieces.length);
      blobs.push((await exported({...row,needsRescan:false},"png",permitted)).blob);
    }
    const {layout,blob}=await ShiyeExport.stack(blobs,direction);
    const key="manual:"+Date.now()+"-"+Math.random().toString(36).slice(2);
    const members=pieces.map(r => r.key), selectedKeys=new Set(members);
    const row={key,kind:"page",manual:true,selected:true,good:true,local:true,cached:true,complete:true,
      w:layout.width,h:layout.height,layout,parts:structuredClone(pieces),members,urls:[],origin:state.origin,
      preview:"",previewUrl:"",revision:key};
    lastJoin={rows:structuredClone(state.rows),key};
    const position=state.rows.findIndex(r => selectedKeys.has(r.key));
    state.rows=state.rows.filter(r => !selectedKeys.has(r.key));state.rows.splice(position,0,row);
    await checkpoint([[key,blob]]);draw();message("已合并为一张 " + row.w + " × " + row.h + " 的整页，点击预览核对后导出。");
  });
}
$("join").onclick=joinSelected;
$("unjoin").onclick=() => operate(async () => {
  if (!lastJoin) return;
  const previous=lastJoin;
  const before=new Map(previous.rows.map(r => [r.key,r]));
  const other=state.rows.filter(r => r.key !== previous.key && !before.has(r.key));
  state.rows=[...previous.rows,...other];lastJoin=null;
  await checkpoint();draw();message("已恢复合并前的分块。");
});
$("scan").onclick = () => operate(manual);
$("scroll").onclick = () => operate(scrollChapter);
$("turn").onclick = () => operate(turnChapter);
$("stop").onclick = () => { stopping = true; setControls(); message("正在停止，当前图片或下载完成后会保留已处理的页面。"); };
$("other").onclick = () => { otherVisible = !otherVisible; draw(); };
$("select").onclick = () => { for (const r of state.rows) if (r.good || otherVisible) r.selected = true; checkpoint(); draw(); };
$("none").onclick = () => { for (const r of state.rows) r.selected = false; checkpoint(); draw(); };
$("clear").onclick = () => {
  if (Date.now() > clearUntil) {
    clearUntil = Date.now() + 5000; $("clear").textContent = "确定清空"; message("再次点「确定清空」会清除此标签页的图片列表。");
    setTimeout(() => { if (Date.now() >= clearUntil) $("clear").textContent = "清空"; }, 5100);
    return;
  }
  operate(async () => {
    await saveChain; await ShiyeDB.clear(tabId);
    const {format, delivery, limit} = state;
    state = {...freshChapter(), format, delivery, limit}; hotBlobs.clear(); retry = null; otherVisible = false; lastJoin = null;
    cacheWarning = false; clearUntil = 0; $("clear").textContent = "清空"; $("retry").hidden = true;
    $("report").replaceChildren(); $("extra").replaceChildren(); draw(); message("当前列表已清空。");
  });
};
$("title").oninput = () => { state.title = $("title").value; checkpoint(); };
$("limit").onchange = () => { state.limit = Math.max(1, Math.min(500, Math.trunc(Number($("limit").value)) || 100)); $("limit").value = state.limit; checkpoint(); };
$("format").onchange = () => { state.format = $("format").value; setControls(); checkpoint(); };
$("delivery").onchange = () => { state.delivery = $("delivery").value; checkpoint(); };
$("export").onclick = () => launchExport();
$("retry").onclick = () => launchExport(true);
chrome.tabs.onActivated.addListener(info => { if (info.windowId === windowId) bindActive().catch(e => message(failure(e), true)); });
chrome.windows.getCurrent().then(win => { windowId = win.id; return bindActive(); }).catch(e => message(failure(e), true));
setControls();
