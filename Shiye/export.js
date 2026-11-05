"use strict";
(() => {
  const MiB = 1024 * 1024;
  function safeName(raw) {
    let name = String(raw || "").normalize("NFC").replace(/[<>:"/\\|?*\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, "_");
    name = Array.from(name.trim().replace(/^\.+|[. ]+$/g, "")).slice(0, 65).join("").trim().replace(/[. ]+$/, "");
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = "_" + name;
    return name || "漫画章节";
  }

  async function originalType(blob) {
    const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    if (b.length >= 8 && [137,80,78,71,13,10,26,10].every((x, i) => b[i] === x)) return "image/png";
    if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
    return "";
  }

  async function decode(blob) {
    try { return await createImageBitmap(blob); }
    catch {
      const url = URL.createObjectURL(blob);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return img;
      } catch { throw new Error("浏览器无法解码这张图片，请在阅读器重新加载后追加"); }
      finally { URL.revokeObjectURL(url); }
    }
  }

  async function convert(blob, format) {
    const mime = format === "jpg" ? "image/jpeg" : "image/png";
    if (await originalType(blob) === mime) return blob.type === mime ? blob : blob.slice(0, blob.size, mime);
    const image = await decode(blob);
    const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
    const canvas = document.createElement("canvas");
    try {
      if (!w || !h) throw new Error("图源尺寸无效");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d", {alpha:mime !== "image/jpeg"});
      if (!ctx) throw new Error("图片过大，浏览器无法分配画布");
      if (mime === "image/jpeg") {
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(image, 0, 0);
      const out = await new Promise((resolve, reject) =>
        canvas.toBlob(b => b && b.type === mime ? resolve(b) : reject(new Error("浏览器无法按此格式导出这张图，请试另一格式")), mime, 0.92)
      );
      return out;
    } finally {
      image.close?.();
      canvas.width = canvas.height = 1;
    }
  }

  async function assemble(layout, blobs, format) {
    const images=[];
    let canvas;
    try {
      for (const blob of blobs) images.push(await decode(blob));
      canvas=ShiyeLayout.paint(layout,images);
      const png=await new Promise((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("整页尺寸超出浏览器导出限制")),"image/png"));
      return await convert(png,format);
    } finally {
      for (const image of images) image.close?.();
      if (canvas) canvas.width=canvas.height=1;
    }
  }

  async function stack(blobs, direction) {
    const images=[];
    let canvas;
    try {
      if (blobs.length < 2) throw new Error("请至少选择同一页的两块图片");
      for (const blob of blobs) images.push(await decode(blob));
      const sizes=images.map(im => ({w:im.naturalWidth || im.width,h:im.naturalHeight || im.height}));
      const vertical=direction !== "horizontal";
      const fixed=vertical ? "w" : "h";
      if (sizes.some(s => s[fixed] !== sizes[0][fixed])) throw new Error(vertical ? "选中图片宽度不一致，请只选择同一页的分块" : "选中图片高度不一致，请只选择同一页的分块");
      const width=vertical ? sizes[0].w : sizes.reduce((n,s) => n+s.w,0);
      const height=vertical ? sizes.reduce((n,s) => n+s.h,0) : sizes[0].h;
      let offset=0;
      const pieces=sizes.map(s => {
        const box=vertical ? {x:0,y:offset/height,w:1,h:s.h/height} : {x:offset/width,y:0,w:s.w/width,h:1};
        offset+=vertical ? s.h : s.w;
        return {...s,box,crop:{x:0,y:0,w:1,h:1},ready:true};
      });
      const layout={width,height,pieces,issue:""};
      canvas=ShiyeLayout.paint(layout,images);
      const blob=await new Promise((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("整页尺寸超出浏览器导出限制")),"image/png"));
      return {layout,blob};
    } finally {
      for (const image of images) image.close?.();
      if (canvas) canvas.width=canvas.height=1;
    }
  }

  async function zipGroup(entries) {
    const archive = new JSZip();
    for (const entry of entries) archive.file(entry.file, new Uint8Array(await entry.blob.arrayBuffer()));
    return archive.generateAsync({type:"blob", compression:"STORE"});
  }

  async function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    try {
      const id = await chrome.downloads.download({url, filename, conflictAction:"uniquify", saveAs:false});
      await new Promise((resolve, reject) => {
        let settled = false;
        function finish(error) {
          if (settled) return;
          settled = true;
          chrome.downloads.onChanged.removeListener(changed);
          if (error) reject(error); else resolve();
        }
        function changed(delta) {
          if (delta.id !== id) return;
          if (delta.state?.current === "complete") finish();
          if (delta.state?.current === "interrupted") finish(new Error("下载中断或已取消" + (delta.error?.current ? " · " + delta.error.current : "")));
        }
        chrome.downloads.onChanged.addListener(changed);
        chrome.downloads.search({id}).then(([item]) => {
          if (item?.state === "complete") finish();
          else if (!item || item.state === "interrupted") finish(new Error("下载已被取消或中断"));
        }, finish);
      });
    } finally { URL.revokeObjectURL(url); }
  }

  function makePlan(rows, format) {
    const width = Math.max(3, String(rows.length).length);
    return rows.map((row, index) => ({key:row.key, file:String(index + 1).padStart(width, "0") + "." + format}));
  }

  globalThis.ShiyeExport = {safeName, convert, assemble, stack, zipGroup, download, makePlan, groupLimit:96 * MiB};
})();
