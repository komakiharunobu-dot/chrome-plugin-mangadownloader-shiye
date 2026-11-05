"use strict";
(() => {
  const version = 2;
  if (globalThis.ShiyeLayout?.version === version) return;
  const valid = n => Number.isFinite(n) && n > 0;
  const nativeSize = image => ({w:image.naturalWidth || image.width || 0, h:image.naturalHeight || image.height || 0});
  function rectangle(el) {
    const r = el.getBoundingClientRect();
    return {x:r.left, y:r.top, w:r.width, h:r.height};
  }
  function intersection(a, b) {
    const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
    return {x, y, w:Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h:Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y)};
  }
  function percentages(el) {
    const out = {};
    for (const name of ["top", "left", "right", "bottom", "width", "height"]) {
      const raw = el.style?.[name] || "";
      out[name] = /^-?\d+(?:\.\d+)?%$/.test(raw) ? parseFloat(raw) / 100 : null;
    }
    const w = out.width ?? (out.left !== null && out.right !== null ? 1 - out.left - out.right : null);
    const h = out.height ?? (out.top !== null && out.bottom !== null ? 1 - out.top - out.bottom : null);
    if (out.left === null || out.top === null || !valid(w) || !valid(h)) return null;
    return {x:out.left, y:out.top, w, h};
  }
  function percentBox(image, root) {
    let node = image;
    while (node && node !== root) {
      const box = percentages(node);
      if (box) return box;
      node = node.parentElement;
    }
    return null;
  }
  function visiblePiece(image, root, page) {
    const view = root.ownerDocument.defaultView;
    let full = rectangle(image);
    if (!valid(full.w) || !valid(full.h)) return null;
    const css = view.getComputedStyle(image);
    const size = nativeSize(image);
    if (["contain", "cover", "none", "scale-down"].includes(css.objectFit) && valid(size.w) && valid(size.h)) {
      const fit = css.objectFit;
      let scale = fit === "cover" ? Math.max(full.w / size.w, full.h / size.h) : Math.min(full.w / size.w, full.h / size.h);
      if (fit === "none") scale = 1;
      if (fit === "scale-down") scale = Math.min(scale, 1);
      const positions = (css.objectPosition || "50% 50%").split(/\s+/);
      const offset = (raw, space) => /%$/.test(raw) ? parseFloat(raw) * space / 100 : parseFloat(raw) || 0;
      full = {x:full.x + offset(positions[0], full.w - size.w * scale), y:full.y + offset(positions[1] || "50%", full.h - size.h * scale), w:size.w * scale, h:size.h * scale};
    }
    let cut = intersection(full, rectangle(image));
    // Clip within this page only. Viewport and spread clipping must not remove page pixels.
    for (let node = image.parentElement; node && node !== root; node = node.parentElement) {
      const style = view.getComputedStyle(node);
      const box = rectangle(node);
      if (/(hidden|clip|scroll|auto)/.test(style.overflowX || style.overflow || "")) {
        cut = intersection(cut, {x:box.x, y:cut.y, w:box.w, h:cut.h});
      }
      if (/(hidden|clip|scroll|auto)/.test(style.overflowY || style.overflow || "")) {
        cut = intersection(cut, {x:cut.x, y:box.y, w:cut.w, h:box.h});
      }
    }
    cut = intersection(cut, page);
    return {box:{x:(cut.x-page.x)/page.w, y:(cut.y-page.y)/page.h, w:cut.w/page.w, h:cut.h/page.h},
      crop:{x:(cut.x-full.x)/full.w, y:(cut.y-full.y)/full.h, w:cut.w/full.w, h:cut.h/full.h},
      density:size.w / full.w};
  }
  function gap(layout) {
    const epsX = Math.min(0.0005, 0.51 / layout.width), epsY = Math.min(0.0005, 0.51 / layout.height);
    const boxes = layout.pieces.map(p => p.box);
    if (boxes.some(b => ![b.x,b.y,b.w,b.h].every(Number.isFinite) || b.w <= 0 || b.h <= 0 || b.x < -epsX || b.y < -epsY || b.x+b.w > 1+epsX || b.y+b.h > 1+epsY)) return true;
    const ys = [...new Set([0,1,...boxes.flatMap(b => [Math.max(0,b.y),Math.min(1,b.y+b.h)])])].sort((a,b) => a-b);
    for (let i=1; i<ys.length; i++) {
      if (ys[i]-ys[i-1] <= epsY) continue;
      const middle = (ys[i]+ys[i-1])/2;
      const intervals = boxes.filter(b => middle >= b.y && middle <= b.y+b.h).sort((a,b) => a.x-b.x);
      let edge = 0;
      for (const box of intervals) {
        if (box.x > edge+epsX) return true;
        edge = Math.max(edge,box.x+box.w);
      }
      if (edge < 1-epsX) return true;
    }
    return false;
  }
  function plan(root, images) {
    const page = rectangle(root), drawn = valid(page.w) && valid(page.h);
    const pieces = images.map(image => {
      const size = nativeSize(image);
      const placement = drawn ? visiblePiece(image, root, page) : null;
      const box = placement?.box || percentBox(image,root);
      return {box, crop:placement?.crop || {x:0,y:0,w:1,h:1}, w:size.w, h:size.h,
        ready:image.localName === "canvas" ? valid(size.w)&&valid(size.h) : image.complete && size.w>4 && size.h>4,
        density:placement?.density || 0};
    });
    const badPosition = pieces.some(p => !p.box);
    const width = drawn ? Math.round(page.w * Math.max(0,...pieces.map(p => p.density))) : Math.round(Math.max(0,...pieces.map(p => p.box && p.w/p.box.w || 0)));
    const height = drawn ? Math.round(width * page.h/page.w) : Math.round(Math.max(0,...pieces.map(p => p.box && p.h/p.box.h || 0)));
    const result = {width,height,pieces,issue:""};
    if (badPosition || !valid(width) || !valid(height)) result.issue="暂时无法确认整页尺寸，请让该页显示后重新扫描";
    else if (!pieces.length || pieces.some(p => !p.ready)) result.issue="本页仍有分块未加载，请等整页显示后重新扫描";
    else if (gap(result)) result.issue="本页有缺块或空隙，请等整页显示后重新扫描";
    return result;
  }
  function paint(layout, images, maxSize = 0) {
    if (layout.issue) throw new Error(layout.issue);
    if (images.length !== layout.pieces.length || gap(layout)) throw new Error("整页分块不齐，无法导出");
    const factor = maxSize ? Math.min(1,maxSize/layout.width,maxSize/layout.height) : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1,Math.round(layout.width*factor)); canvas.height = Math.max(1,Math.round(layout.height*factor));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("整页过大，浏览器无法分配画布");
    try {
      for (const [i, image] of images.entries()) {
        const p=layout.pieces[i], size=nativeSize(image), b=p.box, c=p.crop;
        if (size.w!==p.w || size.h!==p.h) throw new Error("分块尺寸发生变化，请重新扫描该页");
        const x=Math.round(b.x*canvas.width), y=Math.round(b.y*canvas.height);
        const right=Math.round((b.x+b.w)*canvas.width), bottom=Math.round((b.y+b.h)*canvas.height);
        ctx.drawImage(image,c.x*size.w,c.y*size.h,c.w*size.w,c.h*size.h,x,y,right-x,bottom-y);
      }
      return canvas;
    } catch (error) { canvas.width=canvas.height=1; throw error; }
  }
  globalThis.ShiyeLayout = {version, plan, paint, gap};
})();
