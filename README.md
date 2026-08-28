# 🌐 机场梯子 (jichangtizi.net)

<p align="center">
  <strong>2026 稳定机场推荐与梯子评测导航 · 高性能 SEO / GEO 增长门户</strong>
</p>

<p align="center">
  <a href="https://jichangtizi.net"><strong>🌐 官方在线门户</strong></a> ·
  <a href="https://jichangtizi.net/recommend/best-airports/">🏆 2026 机场排行榜</a> ·
  <a href="https://jichangtizi.net/reviews/guangsu-cloud/">⚡ 光速云深度评测</a> ·
  <a href="https://jichangtizi.net/tutorials/clash-verge-rev/">🛠️ Clash 教程</a>
</p>

<p align="center">
  <img alt="Astro v6" src="https://img.shields.io/badge/Astro-6.4.8-BC52EE?style=flat-square&logo=astro&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/TailwindCSS-v3.4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white">
  <img alt="Fuse.js" src="https://img.shields.io/badge/Search-Fuse.js-EF4444?style=flat-square">
  <img alt="IndexNow" src="https://img.shields.io/badge/IndexNow-Ready-008080?style=flat-square">
  <img alt="SEO Safety Gate" src="https://img.shields.io/badge/SEO_Safety_Gate-PASSED-success?style=flat-square">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square">
</p>

---

## 📖 项目简介

`jichangtizi.net` 是一个专注于 **2026 年度高速稳定科学上网机场推荐、IEPL/IPLC 专线实测、Clash / Shadowrocket 客户端教程、网络故障排障诊断与防跑路风险预警** 的现代化评测门户。

项目基于 **Astro 6 静态站点生成（SSG）** 架构，融合 **Anti-AI 意图隔离 URL 体系**、**Topic Cluster 主题集群** 与 **GEO（生成式 AI 搜索可见性）优化**，专为应对 Google AI Overviews、Bing Copilot 与新一代语义搜索引擎而设计。

---

## ✨ 核心特色与工程亮点

```text
jichangtizi.net/
│
├── 01. 商业推荐空间 [/recommend/]   ──► 2026 机场全景天梯大榜、便宜机场、AI 解锁专线
├── 02. 品牌深度评测 [/reviews/]     ──► 光速云、微风网络、龙猫云全景深度横评
├── 03. 对比与替代决策 [/compare/]   ──► 龙猫云 vs 光速云 1对1对比、替代选型矩阵
├── 04. 客户端实操教程 [/tutorials/] ──► Clash Verge Rev、Shadowrocket 零基础配置手册
├── 05. 故障排障与诊断 [/issues/]    ──► 有节点无网络、Timeout 超时、晚高峰卡顿 7 步排障
├── 06. 专线与协议百科 [/protocols/] ──► IEPL、IPLC、VLESS-Reality、Hysteria 2 底层原理解析
├── 07. 知识库与基础概念 [/wiki/]    ──► Clash 概念、机场与 VPN 区别、Mihomo 内核演进
└── 08. 风险监控数据库 [/risk/]      ──► 机场跑路 10 大前兆预警、安全隐私评估、服务状态核验
```

### 1. 🛡️ 工业级 SEO 发布安全门禁 (Release Safety Gate)
- **10 维前置自动化校验**：在每次构建与部署前自动扫描 `robots.txt`、`noindex` 误杀、`canonical` 一致性、`Sitemap` 波动、内部死链（404/空链接）、Schema 语法及重复 Title，杜绝全站掉索引风险；
- **IndexNow 极速推送**：内置 Bing & Yandex IndexNow API 秒级收录通知系统；
- **全量 301 映射平滑继承**：历史路径 100% 映射至全新语义化路由，权重与外部反链零损耗。

### 2. ⚡ 极致的前端与阅读体验
- **纯静态渲染（SSG）**：秒级首屏加载，Google PageSpeed 移动端/桌面端满分表现；
- **自适应 Material Design 3 动效**：原生平滑 View Transitions 页面切换；
- **全场景交互组件**：Top 5 巅峰展台、全景参数对比矩阵、一键复制优惠券与 Toast 反馈；
- **全功能排版引擎**：支持 KaTeX 数学公式、Mermaid 流程图、图片灯箱（Lightbox）与 PDF 打印导出。

---

## 🛠️ 本地开发与常用命令

### 环境要求
- **Node.js** `>= 22.12.0`
- **npm** `>= 9.6.5`

### 1. 克隆与安装
```bash
git clone https://github.com/qweqwe98698-tech/jichangtizi.net.git
cd jichangtizi.net
npm install
```

### 2. 启动本地开发服务
```bash
npm run dev
# 默认访问地址：http://localhost:4321
```

### 3. 构建与发布安全检查
```bash
# 运行标准构建并在打包后自动执行 10 维 SEO 安全健康门禁
npm run build:safe

# 单独执行 SEO 索引健康检查
npm run seo:check

# 向 Bing / Yandex 提交 IndexNow 极速收录
npm run seo:indexnow

# 运行 URL 规范与 Topic Cluster 审计
npm run seo:audit
```

---

## 📂 目录结构说明

```text
jichangtizi.net/
├── public/                 # 静态资源、IndexNow 密钥、Favicon、Redirect 映射
├── scripts/                # 自动化工程脚本
│   ├── seo-health-check.mjs# 🛡️ 10 维 SEO 发布安全门禁脚本
│   ├── indexnow-submit.mjs # ⚡ IndexNow 极速推送客户端
│   ├── audit-urls.mjs      # 🔍 URL 架构与 Topic Cluster 前置审计
│   └── migrate-urls.mjs    # 🔄 301 重定向与全站内链迁移工具
├── seo-system/             # 🏛️ SEO 资产中枢库
│   ├── keywords.json       # 全站 100 分制关键词资产库
│   ├── url-map.json        # 语义化 URL 映射与转化拓扑表
│   ├── topic-clusters.json # 6 大主题集群结构定义
│   ├── internal-links.json # 网状内链与锚文本字典
│   ├── content-calendar.json # 增长排期管线
│   ├── redirects.json      # 301 永久重定向映射表
│   └── seo-rules.md        # SEO / GEO 架构执行规范手册
├── src/
│   ├── components/         # Astro UI 组件 (Hero, PostList, BaseHead, Table 等)
│   ├── config/             # 全局站点、个人资料与 Hero 配置文件
│   ├── content/blog/       # 8 大语义化目录 Markdown 内容资产
│   ├── layouts/            # 页面布局模版 (PageShell, BlogPost)
│   ├── lib/                # 搜索引擎索引、内容解析与工具函数
│   ├── pages/              # Astro 动态与静态页面路由
│   └── styles/             # 全局样式与 MD3 动效变量
└── astro.config.mjs        # Astro 配置文件 (301 重定向、Sitemap 过滤器、Markdown 插件)
```

---

## 🚀 部署说明

项目打包输出纯静态 HTML/CSS/JS 文件（位于 `dist/` 目录），兼容任何主流静态托管平台：

### 1. Cloudflare Pages / Workers (推荐)
- **Framework Preset**: `Astro`
- **Build Command**: `npm run build:safe`
- **Output Directory**: `dist`
- **Node.js Version**: `22.x`

### 2. Vercel / Netlify
- 直接导入 GitHub 仓库，构建命令填写 `npm run build:safe`，输出目录填写 `dist` 即可秒级上线。

---

## 📄 许可证

本项目基于 [MIT License](./LICENSE) 开源。
