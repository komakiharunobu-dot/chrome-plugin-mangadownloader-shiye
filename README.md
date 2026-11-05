# 拾页 · Shiye

漫画图片收集与下载工具 / Manga Image Collector & Downloader

Chrome extension · JPG / PNG · ZIP export · Windows / macOS

简体中文 · English

简体中文

拾页是一款 Chrome 浏览器扩展，可以从漫画章节网页中收集图片，预览并调整页序，然后导出为 JPG 或 PNG。支持逐张保存或 ZIP 打包，图片转换与打包均在本机完成。

部分漫画阅读器会把一页拆成多张横条或图片块。拾页可在兼容的分页结构中识别这些分块，按页面位置合成为整页；无法自动识别时，也可以手动合并。

功能

多种收集方式：扫描当前网页、滚动收集，或通过可识别的下一页按钮自动翻页。

图源识别：支持常见图片标签、懒加载属性、分辨率候选、单图 CSS 背景、可读取的画布及临时图片。

整页分块合成：在支持的分页容器中按位置重组图片，按源图像素密度推算整页尺寸。

缺块检查：已识别的整页若存在缺块、空隙或未加载的图片，会提示问题并阻止残页导出。

手动合并：将同一页的图片按从上到下或从左到右的顺序合并，支持撤销上次合并。

预览与排序：检查缩略图和预览，勾选需要的页面，并调整导出顺序。

JPG / PNG 导出：支持逐张保存、ZIP 打包、较大章节自动分卷，以及仅重试失败页。

本机处理：图片解码、转换、合成和打包在本机执行。

安装

需要 Windows 或 macOS 上的桌面版 Chrome 116 或更新版本。

下载并解压本项目，保留完整目录结构。

在 Chrome 地址栏输入 chrome://extensions。

打开右上角的开发者模式。

点击加载已解压的扩展程序。

选择包含 manifest.json 的 Shiye 文件夹。

在 Chrome 工具栏的扩展程序菜单中固定“拾页”。

安装后请保留 Shiye 文件夹，Chrome 会继续从该目录加载扩展。无需安装 Node.js，也无需构建。

使用

打开漫画的章节阅读页，点击工具栏中的拾页图标。

根据网站的阅读方式选择：

扫描 / 追加当前页：收集当前网页中可识别的图片，可重复追加。

滚动收集：从阅读区顶部逐段扫描到底部，结束后返回原来的滚动位置。

自动翻页：从章节第一页开始，使用可识别的下一页控件继续收集。默认最多收集 100 个阅读器页面，可设置为 1–500 个。

点击缩略图预览，取消广告或重复图的勾选，用 ↑ / ↓ 调整顺序。

填写章节名称，选择 PNG 或 JPG，再选择 ZIP 压缩包或逐张保存。

点击导出所选图片，等待保存完成。

文件按所选顺序命名为 001.png、002.png……或对应的 .jpg 文件。ZIP 按约 96 MiB 的图片数据自动分卷，每个分卷均可单独解压。失败页可通过仅重试失败页补存，保留原来的文件编号。

PNG 保留透明背景；转换为 JPG 时使用白底和 92% 编码质量。原生整图与目标格式一致时可直接保存原文件；分块页需要合成并重新编码。清晰度取决于网站提供的图源。

如果下载的仍是半页或横条

翻到对应页面，等待所有图片块加载完成，重新扫描。自动识别成功的条目会显示整页 · N 块。

如果显示分块未齐，先等待缺失部分加载，再扫描。

如果网站的页面边界未被自动识别，点击全不选，只勾选同一漫画页的分块。

用 ↑ / ↓ 排好顺序，展开手动合并一页的分块，选择从上到下或从左到右，然后合并。

预览并检查页首、接缝和页尾。选错时点击撤销上次合并。

纵向合并要求分块等宽，横向合并要求分块等高。手动合并无法补回尚未加载的内容，也无法判断你是否漏选了某一块；请检查预览。撤销仅保留当前侧边栏会话中的最后一次合并。

从 v1.0 更新至 v1.1

关闭拾页侧边栏，用新版本 Shiye 文件夹中的全部文件替换原文件夹内容，保留原加载路径，并确保包含 layout.js。

打开 chrome://extensions，点击拾页的重新加载图标。

刷新漫画网页，重新打开拾页。

清空旧列表后重新收集。之前下载的残页需要重新导出。

权限与本地数据

权限

用途

activeTab

用户点击扩展图标后，读取当前漫画标签页。

scripting

在已获授权的页面中识别图片和阅读器控件。

sidePanel

显示收集、预览和导出面板。

downloads

保存导出的图片和 ZIP 文件。

可选网站权限

在需要时读取其他域名上的图片，Chrome 可能询问是否授权。

图片仍需要从原网站或图床下载；本地处理指图片转换和打包过程。关闭并重新打开侧边栏可恢复当前漫画标签页的列表；关闭漫画标签页或清空列表会清除相应的本地记录。导出期间请保留漫画标签页和侧边栏。

兼容性与已知限制

自动整页合成依赖可识别的分页结构，包括 SpeedBinb 常见的 content-pN 容器及部分带数字页码的容器，不能保证适配所有网站。

自动翻页依赖可识别的下一页控件；特殊按钮可改用手动翻页后追加扫描。

跨域框架、禁止读取的画布、加密拼图及专用客户端阅读器可能需要针对网站适配。

单页超过浏览器画布或内存限制时，合成或转换可能失败。

界面目前为简体中文。

v1.1.0 已通过 21 项回归检查，使用模拟网页和扩展 API，以及实际图像库完成像素、尺寸与 ZIP 验证。三段测试图合成的 1127 × 1612 PNG 与原图逐像素一致。

目标 yanmaga.jp 章节在测试环境返回 403，尚未完成该章节的在线复测；也尚未在 Windows 和 macOS 的本机 Chrome 中分别安装验证。

报告问题时，请提供网站及章节地址、Chrome 和扩展版本、操作步骤、错误提示，以及不完整图片的尺寸或截图，方便定位。

v1.1.0 更新内容

新增可识别分页容器内的整页分块合成。

新增缺块检查，阻止已识别的不完整页面导出。

新增纵向 / 横向手动合并与撤销。

旧版收集记录需要重新扫描后导出。

English

Shiye is a Chrome extension that collects images from manga chapter pages, lets you preview and reorder them, and exports them as JPG or PNG files. Save images individually or in ZIP archives. Image conversion and packaging run locally.

Some readers divide a manga page into strips or tiles. On supported page structures, Shiye reconstructs these fragments into a complete page using their positions. Manual merging is available for other layouts.

Features

Flexible collection: scan the current document, collect while scrolling, or follow recognizable next-page controls.

Image-source detection: common image elements, lazy-loading attributes, resolution candidates, single-image CSS backgrounds, readable canvases, and temporary image URLs.

Full-page assembly: reconstruct fragments within supported page containers and estimate output dimensions from source pixel density.

Missing-fragment checks: flag gaps, missing fragments, and unloaded images in recognized page groups, blocking incomplete exports.

Manual merging: stack fragments vertically or horizontally and undo the most recent merge.

Preview and ordering: inspect images, choose pages, and adjust their export order.

JPG / PNG export: individual downloads, ZIP archives, automatic archive splitting, and retries for failed pages.

Local processing: decoding, conversion, assembly, and packaging run on your computer.

Installation

Requires desktop Chrome 116 or later on Windows or macOS.

Download and extract the project, keeping its directory structure intact.

Open chrome://extensions in Chrome.

Enable Developer mode.

Click Load unpacked.

Select the Shiye folder containing manifest.json.

Pin Shiye from Chrome’s Extensions menu.

Keep the folder after installation: Chrome loads the extension from that location. No Node.js installation or build step is required. The extension’s interface is currently in Simplified Chinese.

Usage

Open a manga chapter and click the Shiye toolbar icon.

Choose a collection method:

扫描 / 追加当前页 — Scan / append current page: collect recognizable images in the current document; repeat to append more.

滚动收集 — Collect while scrolling: scan from the top of the reading area to the bottom, then restore the initial scroll position.

自动翻页 — Auto page turn: start on the first reader page and follow recognizable next-page controls. The default limit is 100 reader pages, adjustable from 1 to 500.

Click thumbnails to preview, deselect advertisements or duplicates, and use ↑ / ↓ to reorder pages.

Enter a chapter name, choose PNG or JPG, and select ZIP or individual downloads.

Click 导出所选图片 — Export selected images and wait for completion.

Files are numbered in the selected order: 001.png, 002.png, and so on, or their .jpg equivalents. ZIP output splits automatically at approximately 96 MiB of image data; each archive is independently extractable. Use 仅重试失败页 — Retry failed pages only to retry failures while keeping the original file numbers.

PNG preserves transparency. JPG conversion uses a white background and 92% encoding quality. A native full-page image can pass through unchanged when its format matches the selected output; assembled pages require re-encoding. Image quality depends on the source provided by the website.

Fixing partial-page or strip downloads

Display the affected reader page, wait for all fragments to load, and scan again. Recognized assembled pages show 整页 · N 块 — Full page · N fragments.

If a page is marked 分块未齐 — Incomplete fragments, wait for the missing content and rescan.

For unrecognized layouts, click 全不选 — Deselect all and select only the fragments belonging to one manga page.

Arrange them with ↑ / ↓. Expand 手动合并一页的分块 — Manually merge page fragments, choose top-to-bottom or left-to-right, and merge.

Preview the result, checking the beginning, seams, and end. Use 撤销上次合并 — Undo last merge if necessary.

Vertical merging requires equal widths; horizontal merging requires equal heights. Manual merging cannot recover content that has not loaded or detect a fragment you forgot to select. Inspect the preview. Undo retains only the latest merge within the current side-panel session.

Updating from v1.0 to v1.1

Close the side panel and replace all files in the existing Shiye directory with the new version. Keep the same directory path and include the new layout.js file.

Open chrome://extensions and click Shiye’s Reload icon.

Refresh the manga webpage and reopen Shiye.

Clear the old collection and collect the chapter again. Previously downloaded partial pages must be exported again.

Permissions and local data

Permission

Purpose

activeTab

Access the current manga tab after you click the extension icon.

scripting

Detect images and reader controls in the authorized page.

sidePanel

Display the collection, preview, and export interface.

downloads

Save exported images and ZIP archives.

Optional website access

Retrieve images hosted on other domains when needed; Chrome may request permission.

Source images are still downloaded from their websites or image hosts. Local processing refers to conversion and packaging. Closing and reopening the side panel restores the collection for the current manga tab. Closing the manga tab or clearing its collection removes the associated local records. Keep both the manga tab and side panel open during export.

Compatibility and known limitations

Automatic assembly requires recognizable page structures, including common SpeedBinb content-pN containers and some numerically marked page containers. Universal website compatibility is not guaranteed.

Auto page turning requires recognizable controls. For unsupported buttons, turn pages manually and append scans.

Cross-origin frames, unreadable canvases, encrypted image puzzles, and readers requiring dedicated clients may need site-specific support.

Assembly or conversion may fail when a page exceeds browser canvas or memory limits.

The interface is currently in Simplified Chinese.

v1.1.0 passed 21 regression checks using simulated pages and extension APIs with actual image libraries for pixel, dimension, and ZIP validation. A three-fragment 1127 × 1612 PNG matched its reference image pixel for pixel.

The target yanmaga.jp chapter returned HTTP 403 in the test environment, so live verification of that chapter remains incomplete. Separate installation checks in native Windows and macOS Chrome have not yet been completed.

When reporting an issue, include the website and chapter URL, Chrome and extension versions, reproduction steps, error messages, and the dimensions or a screenshot of the incomplete image.

v1.1.0 changes

Added full-page assembly inside recognizable page containers.

Added missing-fragment checks to block recognized incomplete-page exports.

Added vertical / horizontal manual merging and undo.

Required rescanning of legacy collection records before export.

项目文件 / Project files

Path

Description

Shiye/manifest.json

扩展配置 / Extension configuration

Shiye/background.js

后台服务 / Background service worker

Shiye/reader.js

网页图片识别与收集 / Page inspection and collection

Shiye/layout.js

分块布局与整页绘制 / Fragment layout and page rendering

Shiye/export.js

图片转换、合并与下载 / Conversion, merging, and downloads

Shiye/db.js

本地记录与图片缓存 / Local records and image cache

Shiye/panel.html, panel.css, panel.js

侧边栏界面 / Side-panel interface

Shiye/icons/

扩展图标 / Extension icons

Shiye/vendor/

第三方依赖与许可证 / Bundled dependencies and licenses

安装与使用.txt

中文安装与使用说明 / Chinese installation and usage guide

第三方依赖 / Third-party dependency

ZIP 打包使用随项目附带的 JSZip。其许可证见 Shiye/vendor/JSZip-LICENSE.txt。

ZIP packaging uses the bundled JSZip library. Its license is included in Shiye/vendor/JSZip-LICENSE.txt.
