"use strict";
(() => {
  if (globalThis.ShiyeReader?.version === 2) return;
  let handles = new Map();
  const transfers = new Map();
  const thumbnails = new WeakMap();
  let transferId = 0;
  let scroller = null;
  const docId = Math.random().toString(36).slice(2);
  const readerHint = /reader|reading|manga|comic|chapter|episode|webtoon|page[-_ ]?image/i;
  const accessory = /(?:^|[\s/_.-])(avatar|logo|favicon|icon|spinner|loading|spacer|placeholder|blank|transparent|advert|banner|emoji)(?:[\s/_.?-]|$)/i;

  function urlOf(raw, base) {
    if (!raw || !raw.trim() || raw.trim() === "#") return "";
    try {
      const url = new URL(raw.trim(), base);
      if (["http:", "https:", "blob:"].includes(url.protocol) && !url.username && !url.password) return url.href;
      if (url.protocol === "data:" && /^data:image\//i.test(raw)) return raw;
    } catch {}
    return "";
  }

  // Follow srcset's URL token boundary so commas inside CDN URLs survive.
  function rankedSet(raw) {
    const choices = [];
    let i = 0;
    while (i < raw.length) {
      while (i < raw.length && /[\s,]/.test(raw[i])) i++;
      const start = i;
      while (i < raw.length && !/\s/.test(raw[i])) i++;
      let url = raw.slice(start, i);
      if (!url) break;
      let descriptor = "";
      if (url.endsWith(",")) {
        url = url.replace(/,+$/, "");
      } else {
        const d = i;
        while (i < raw.length && raw[i] !== ",") i++;
        descriptor = raw.slice(d, i).trim();
        if (raw[i] === ",") i++;
      }
      if (!descriptor || /^\d+(?:\.\d+)?[wx]$/.test(descriptor)) {
        choices.push({url, weight: parseFloat(descriptor) || 1});
      }
    }
    return choices.sort((a, b) => b.weight - a.weight).map(choice => choice.url);
  }

  function sources(img) {
    const attr = name => img.getAttribute(name) || "";
    const urls = ["data-original", "data-full-src", "data-full", "data-zoom-image", "data-hires", "data-src-original"].map(attr);
    const link = img.closest("a[href]");
    if (link && /\.(?:jpe?g|png|webp|avif|gif|bmp)(?:[?#]|$)/i.test(link.href)) urls.push(link.href);
    for (const name of ["data-srcset", "data-lazy-srcset"]) urls.push(...rankedSet(attr(name)));
    const picture = img.parentElement;
    if (picture?.localName === "picture") {
      const group = [...picture.querySelectorAll("source")].find(s =>
        (!s.media || img.ownerDocument.defaultView.matchMedia(s.media).matches) &&
        (s.getAttribute("data-srcset") || s.srcset)
      );
      if (group) urls.push(...rankedSet(group.getAttribute("data-srcset") || group.srcset));
    }
    urls.push(...rankedSet(attr("srcset")));
    for (const name of ["data-src", "data-lazy-src", "data-original-src", "data-url", "data-image", "data-cfsrc", "data-echo"]) urls.push(attr(name));
    urls.push(img.currentSrc, attr("src"));
    const clean = [...new Set(urls.map(url => urlOf(url, img.baseURI)).filter(Boolean))];
    const useful = clean.filter(url => !(/^data:image\/svg\+xml/i.test(url) || /\b(?:spacer|loading|transparent|placeholder|blank)\.(?:gif|png|svg)(?:[?#]|$)/i.test(url)) );
    return useful.length ? useful : clean;
  }

  function thumb(el) {
    const w = el.naturalWidth || el.width, h = el.naturalHeight || el.height;
    if (!w || !h) return "";
    const scale = Math.min(1, 144 / w, 168 / h);
    const c = el.ownerDocument.createElement("canvas");
    c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
    try {
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(el, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.66);
    } catch { return ""; }
    finally { c.width = c.height = 1; }
  }

  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("画布超出浏览器可导出尺寸")), "image/png");
    });
  }

  async function digest(bytes) {
    if (globalThis.crypto?.subtle) {
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join("");
    }
    let a = 2166136261, b = 0x9e3779b1;
    for (const n of new Uint8Array(bytes)) {
      a = Math.imul(a ^ n, 16777619); b = Math.imul(b ^ n, 1597334677);
    }
    return bytes.byteLength + "-" + (a >>> 0).toString(36) + "-" + (b >>> 0).toString(36);
  }

  function recommended(el, w, h, url, lazy) {
    if (el.localName === "img" && url === el.currentSrc &&
        ((el.naturalWidth > 0 && el.naturalWidth <= 4) || (el.naturalHeight > 0 && el.naturalHeight <= 4) ||
        /^data:image\/svg\+xml/i.test(url))) return false;
    const identity = (el.id || "") + " " + String(el.className || "") + " " + (el.alt || "");
    if (accessory.test(identity) || accessory.test(url.split("?")[0].slice(0, 250)) ||
        el.closest("nav,header,footer,aside,[role=banner],[role=navigation],[class*=recommend i],[class*=advertisement i]")) return false;
    const chapter = el.closest("main,article,[id*=reader i],[class*=reader i],[class*=chapter i],[class*=manga i],[class*=comic i],[class*=webtoon i]");
    if ((w >= 210 && h >= 170 && w * h >= 66000) || (w >= 140 && h >= 500)) return true;
    const promised = el.localName === "img" && ["data-src", "data-original", "data-full", "data-lazy-src", "data-srcset"].some(a => el.hasAttribute(a));
    return lazy && (!!chapter || promised || readerHint.test(identity)) && (w < 4 || h < 4 || w >= 160);
  }

  function bitmapSize(el, rect) {
    return [el.naturalWidth || Math.round(rect.width) || el.width || 0, el.naturalHeight || Math.round(rect.height) || el.height || 0];
  }

  function pageContainer(el) {
    for (let node = el.parentElement; node && node !== el.ownerDocument.body; node = node.parentElement) {
      if (/^content-p\d+$/.test(node.id || "")) return node;
      for (const attr of ["data-page-index", "data-page-number", "data-page"]) {
        if (/^\d+$/.test(node.getAttribute(attr) || "")) return node;
      }
      if (/^(?:comic[-_]?page|manga[-_]?page|reader[-_]?page|page)[-_]?\d+$/i.test(node.id || "")) return node;
    }
    return null;
  }
  async function combinePages(rows, fresh, elements, knownPreviews) {
    const groups = new Map();
    for (const el of elements.keys()) {
      if (!["img","canvas"].includes(el.localName)) continue;
      const root = pageContainer(el);
      if (root && !groups.has(root)) groups.set(root, [...root.querySelectorAll("img,canvas")].filter(n => pageContainer(n) === root));
    }
    const replacements = new Map(), emitted = new Set();
    for (const [root, images] of groups) {
      const layout = ShiyeLayout.plan(root,images);
      // A full-page img already contains the original pixels and needs no assembly.
      if (images.length === 1 && (!/^content-p\d+$/.test(root.id || "") || !layout.issue)) continue;
      const marker = root.id || ["data-page-index","data-page-number","data-page"].map(a => a+"="+root.getAttribute(a)).join("|");
      const pageUrl = new URL(root.ownerDocument.URL); pageUrl.hash = "";
      const key = "page:" + pageUrl.href + "#" + marker;
      const parts = images.map((el,index) => {
        const rawKey = elements.get(el);
        const raw = rows.get(rawKey);
        if (!raw) return {key:key+"/pending/"+index,urls:[],origin:location.origin,local:false};
        // Rendered pieces can be transformed versions of the network original.
        // Their current source, dimensions, and placement describe the assembled page.
        const current = el.currentSrc || el.getAttribute("src") || "";
        const sourceKey = /^(data|blob):/.test(current) ? key+"/piece/"+index : rawKey;
        if (/^(data|blob):/.test(current)) fresh.set(sourceKey,{el,primary:current,localTarget:current,blob:fresh.get(rawKey)?.blob});
        return {...raw,key:sourceKey,urls:/^https?:/.test(current) ? [current] : raw.urls,
          local:raw.local || /^(data|blob):/.test(current),localFallback:false};
      });
      const members = [...new Set(images.map(el => elements.get(el)).filter(Boolean))];
      const revision = await digest(new TextEncoder().encode(JSON.stringify([layout,images.map(el => el.currentSrc || elements.get(el))])));
      let preview = "";
      const previous = thumbnails.get(root);
      if (!layout.issue) {
        if (previous?.stamp === revision) preview = previous.preview;
        else {
          let small;
          try { small=ShiyeLayout.paint(layout,images,168); preview=small.toDataURL("image/jpeg",0.7); }
          catch {}
          finally { if (small) small.width=small.height=1; }
          thumbnails.set(root,{stamp:revision,preview});
        }
      }
      const row={key,kind:"page",w:layout.width,h:layout.height,good:true,local:true,localFallback:false,
        urls:[],preview,previewUrl:"",origin:location.origin,parts,layout,members,revision,complete:!layout.issue};
      fresh.set(key,{layout,images});
      for (const member of members) {
        if (!replacements.has(member)) replacements.set(member,[]);
        replacements.get(member).push(row);
      }
    }
    const out=[];
    for (const row of rows.values()) {
      const group=replacements.get(row.key);
      if (!group) { out.push(row); continue; }
      for (const page of group) if (!emitted.has(page.key)) {out.push(page);emitted.add(page.key);}
    }
    return out;
  }

  async function scan(knownPreviews = []) {
    const seenPreviews = new Set(knownPreviews);
    const rows = new Map(), fresh = new Map(), frames = new Set(), elements = new Map();
    let blockedCanvases = 0;
    async function put(el, urls, kind, rect, blob = null) {
      if (!urls.length && !blob) return;
      const primary = urls[0] || "";
      let key;
      if (blob) key = "canvas:" + await digest(await blob.arrayBuffer());
      else if (primary.startsWith("data:")) key = "data:" + await digest(new TextEncoder().encode(primary));
      else key = primary;
      const primaryLocal = !!blob || /^(data|blob):/.test(primary);
      const liveLocal = kind === "image" && /^(data|blob):/.test(el.currentSrc || "") && el.naturalWidth >= 128 && el.naturalHeight >= 128;
      const localFallback = !primaryLocal && liveLocal;
      const local = primaryLocal || localFallback;
      const [w, h] = kind === "canvas" ? [el.width, el.height] : bitmapSize(el, rect);
      const lazy = kind === "image" && (primary !== el.currentSrc || !el.naturalWidth);
      const good = recommended(el, Math.max(w, rect.width), Math.max(h, rect.height), primary, lazy);
      elements.set(el, key);
      const old = rows.get(key);
      if (old && (old.good || !good)) return;
      const remote = urls.filter(url => /^https?:/.test(url));
      let preview = "";
      if (!seenPreviews.has(key) && (kind === "canvas" || (kind === "image" && el.complete && el.naturalWidth >= 8 && el.naturalHeight >= 8))) {
        const stamp = key + "|" + (el.currentSrc || "");
        const prior = thumbnails.get(el);
        preview = prior?.stamp === stamp ? prior.preview : thumb(el);
        thumbnails.set(el, {stamp, preview});
      }
      const verifiedSize = kind === "canvas" || (kind === "image" && !!el.naturalWidth && el.currentSrc === primary);
      rows.set(key, {
        key, urls: remote, local, localFallback, kind, w: verifiedSize ? w : 0, h: verifiedSize ? h : 0, good, preview,
        previewUrl: remote.includes(el.currentSrc) ? el.currentSrc : remote[0] || "",
        origin: location.origin
      });
      fresh.set(key, {el, primary, localTarget:localFallback ? el.currentSrc : primary, blob});
    }
    async function walk(doc) {
      const view = doc.defaultView;
      for (const el of doc.querySelectorAll("img,canvas,iframe,main,article,section,figure,div,li,a,[style*=background]")) {
        const tag = el.localName;
        if (tag === "iframe") {
          try {
            if (el.contentDocument?.documentElement) await walk(el.contentDocument);
            else if (el.src) frames.add(el.src);
          } catch { if (el.src) frames.add(el.src); }
          continue;
        }
        const rect = el.getBoundingClientRect();
        if (tag === "img") { await put(el, sources(el), "image", rect); continue; }
        if (tag === "canvas") {
          if (el.width < 140 || el.height < 150 || !rect.width || !rect.height) continue;
          try { await put(el, [], "canvas", rect, await canvasBlob(el)); } catch { blockedCanvases++; }
          continue;
        }
        if (rect.width < 140 || rect.height < 140) continue;
        const bg = view.getComputedStyle(el).backgroundImage;
        const match = /^url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)$/.exec(bg);
        if (match) {
          const u = urlOf(match[1] || match[2] || match[3] || "", doc.baseURI);
          if (u) await put(el, [u], "background", rect);
        }
      }
    }
    await walk(document);
    const combined = await combinePages(rows, fresh, elements, seenPreviews);
    handles = fresh;
    return {rows: combined, title: document.title, href: location.href, origin: location.origin,
      frames: [...frames].filter(url => /^https?:/.test(url)), blockedCanvases, docId};
  }

  async function prepare(key, url, origin) {
    if (location.origin !== origin) throw new Error("来源标签已切换站点");
    const entry = handles.get(key);
    const el = entry?.el;
    let blob = entry?.blob;
    if (!blob && entry?.layout) {
      const canvas = ShiyeLayout.paint(entry.layout, entry.images);
      try { blob = await canvasBlob(canvas); }
      finally { canvas.width = canvas.height = 1; }
    }
    if (!blob) {
      const target = url || entry?.localTarget;
      if (!target) throw new Error("此页已离开阅读器，请翻回后追加");
      const view = el?.ownerDocument?.defaultView || window;
      try {
        const r = await view.fetch(target, {credentials: "same-origin", signal: AbortSignal.timeout(10000)});
        if (!r.ok) throw new Error("HTTP " + r.status);
        blob = await r.blob();
        if (!blob.size || /^(text\/|application\/(json|xhtml))/i.test(blob.type)) throw new Error("图源返回了网页或空文件");
      } catch (error) {
        if (el?.localName !== "img" || !el.complete || !el.naturalWidth || el.currentSrc !== target) throw error;
        const c = el.ownerDocument.createElement("canvas");
        c.width = el.naturalWidth; c.height = el.naturalHeight;
        try { c.getContext("2d").drawImage(el, 0, 0); blob = await canvasBlob(c); }
        finally { c.width = c.height = 1; }
      }
    }
    const id = ++transferId;
    transfers.set(id, blob);
    return {id, docId, size: blob.size, type: blob.type};
  }

  async function part(id, documentId, start, length) {
    const blob = transfers.get(id);
    if (!blob || documentId !== docId) throw new Error("图片传输时网页发生跳转，请重新追加");
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1] || "");
      reader.onerror = () => reject(new Error("无法读取图源"));
      reader.readAsDataURL(blob.slice(start, start + length));
    });
  }

  function documents(root = document) {
    const docs = [root];
    for (const frame of root.querySelectorAll("iframe")) {
      try { if (frame.contentDocument?.documentElement) docs.push(...documents(frame.contentDocument)); } catch {}
    }
    return docs;
  }

  function startScroll() {
    let best = null, score = -1;
    for (const doc of documents()) {
      const view = doc.defaultView;
      const root = doc.scrollingElement;
      if (!root) continue;
      for (const el of [root, ...doc.querySelectorAll("main,article,section,div,ul")]) {
        if (el !== root && (el.clientHeight < 150 || el.clientWidth < 175 ||
            !/(auto|scroll|overlay)/.test(view.getComputedStyle(el).overflowY))) continue;
        const range = el.scrollHeight - el.clientHeight;
        if (range < 3) continue;
        const area = Math.min(view.innerHeight, el.clientHeight) * Math.min(view.innerWidth, el.clientWidth);
        const weight = area * Math.min(4, 1 + Math.log2(el.scrollHeight / Math.max(1, el.clientHeight)));
        if (weight > score) { score = weight; best = el; }
      }
    }
    const el = best || document.scrollingElement;
    if (!el) throw new Error("找不到阅读区");
    scroller = {el, initial: el.scrollTop};
    el.scrollTo({top: 0, behavior: "instant"});
    return true;
  }

  function stepScroll() {
    if (!scroller || !scroller.el.isConnected) throw new Error("阅读区已刷新，请重新滚动收集");
    const el = scroller.el, old = el.scrollTop;
    el.scrollTo({top: old + Math.max(100, Math.floor(el.clientHeight * 0.78)), behavior: "instant"});
    return {bottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 3, top: el.scrollTop, height: el.scrollHeight};
  }

  function sameChapter(from, to) {
    let a, b;
    try { a = new URL(from); b = new URL(to, a); } catch { return false; }
    if (a.origin !== b.origin || !["http:", "https:"].includes(b.protocol)) return false;
    for (const k of ["chapter", "chapter_id", "chapterId", "cid", "episode", "episodeId", "episode_id"]) {
      if (a.searchParams.get(k) !== b.searchParams.get(k)) return false;
    }
    const pattern = /(?:chapter|episode|chap|ch)[/_-]?(\d+(?:[.-]\d+)?)(?=[/?#_-]|$)/i;
    const left = pattern.exec(a.pathname)?.[1], right = pattern.exec(b.pathname)?.[1];
    return left === right;
  }

  function nextPage() {
    const chapter = /下一[話话章节卷部回集]|下[一個个]*[話话章卷回集]|次の[話話章巻回]|next\s*(?:chapter|episode|volume|issue)/i;
    const explicit = /下\s*(?:一\s*)?[頁页]|後一頁|后一页|次のページ|次頁|next\s+page|page\s+suivante/i;
    for (const doc of documents()) {
      for (const el of doc.querySelectorAll("a,button,[role=button],input[type=button]")) {
        if (el.disabled || el.getAttribute("aria-disabled") === "true" || el.closest("[inert],.disabled") || !el.getClientRects().length) continue;
        const label = [el.textContent, el.title, el.getAttribute("aria-label"), el.value, el.querySelectorAll("img")[0]?.alt].filter(Boolean).join(" ").trim();
        const identity = [el.id, el.className, el.getAttribute("data-action")].join(" ");
        const pageId = /(?:next[-_ ]?page|page[-_ ]?next)/i.test(identity);
        if ((!label && !pageId) || chapter.test(label) || /next[-_ ]?(chapter|episode)/i.test(identity)) continue;
        const pager = el.closest(".pagination,.pager,.page-navigation,[aria-label*=pagination i],[aria-label*=页码],[aria-label*=頁碼]");
        if (!pageId && !explicit.test(label) && !(pager && /^(next|次へ|›|»|→)(?:\s|$)/i.test(label))) continue;
        if (el.localName === "a" && el.target && !["_self", "_top", "_parent"].includes(el.target)) continue;
        const href = el.getAttribute("href");
        if (href && !/^#|^javascript:\s*(?:void\s*\(0\)\s*;?|;)$/i.test(href) && !sameChapter(doc.URL, el.href)) continue;
        setTimeout(() => el.click(), 40);
        return {ok:true};
      }
      for (const el of doc.querySelectorAll("select")) {
        if (el.disabled || !el.getClientRects().length || el.selectedIndex < 0) continue;
        const opts = [...el.options], ix = el.selectedIndex;
        const label = [el.name, el.id, el.className, el.getAttribute("aria-label"), ...Array.from(el.labels || [], x => x.textContent)].join(" ");
        const numeric = opt => /^\s*(?:第\s*|page\s*)?(\d+)\s*(?:[页頁])?\s*$/i.exec(opt.textContent)?.[1];
        if ((!/page|[頁页]/i.test(label) && !opts.every(o => /[頁页]|page/i.test(o.textContent))) ||
            /chapter|episode|[話话章]/i.test(label) || !opts[ix + 1] || opts[ix + 1].disabled ||
            !numeric(opts[ix]) || Number(numeric(opts[ix + 1])) !== Number(numeric(opts[ix])) + 1) continue;
        const value = opts[ix + 1].value;
        if (value && !/^\d+$/.test(value) && !sameChapter(doc.URL, value)) continue;
        setTimeout(() => { el.selectedIndex = ix + 1; el.dispatchEvent(new doc.defaultView.Event("change", {bubbles:true})); }, 40);
        return {ok:true};
      }
    }
    return {ok:false, reason:"没有可确认的下一页按钮，已停在当前页。"};
  }

  globalThis.ShiyeReader = {version:2, scan, prepare, part, startScroll, stepScroll, nextPage,
    release(id, documentId) { if (documentId === docId) transfers.delete(id); },
    endScroll() {
      if (scroller) { scroller.el.scrollTo({top: scroller.initial, behavior:"instant"}); scroller = null; }
    }
  };
})();
