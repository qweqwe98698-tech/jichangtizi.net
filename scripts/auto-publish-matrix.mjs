import fs from 'node:fs';
import path from 'node:path';

/**
 * ⚡ 全自动万字级 SEO/GEO 专题矩阵文章生成引擎
 * 防批量 AI 识别优化系统 (Anti-AI Fingerprint & Organic SEO Engine)
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
if (!DEEPSEEK_API_KEY) {
  console.error('❌ Error: DEEPSEEK_API_KEY environment variable is missing.');
  process.exit(1);
}

const BLOG_DIR = path.resolve('src/content/blog');
const CATEGORIES = ['reviews', 'compare', 'protocols', 'issues', 'tutorials', 'wiki', 'risk', 'recommend'];

// 8 大核心主线方向与精选选题种子库 (SEO / GEO 矩阵)
const TOPIC_SEEDS = [
  {
    category: 'protocols',
    titleSeed: '2026 最新 VLESS-XTLS-Vision 与 Hysteria2 协议底层对比与握手耗时实测',
    slugSeed: 'vless-vision-vs-hysteria2-latency-benchmark',
    categories: ['协议科普'],
    tags: ['VLESS', 'Hysteria2', '协议对比', '延迟优化', '专线测速'],
    keywordFocus: 'VLESS XTLS Vision, Hysteria2 UDP, 握手延迟, GFW 特征阻断, 伪装域名配置'
  },
  {
    category: 'tutorials',
    titleSeed: 'Clash Verge Rev 游戏模式与特定端口低延迟分流规则高级配置全解',
    slugSeed: 'clash-verge-rev-gaming-low-latency-rules',
    categories: ['客户端教程'],
    tags: ['Clash', 'Clash Verge Rev', '游戏加速', '分流规则', '低延迟'],
    keywordFocus: 'Clash Verge Rev, 游戏节点分流, Steam加速, 降低Ping值, 进程级代理'
  },
  {
    category: 'reviews',
    titleSeed: '2026 主流 IEPL 物理内网专线机场晚高峰丢包率与真实单线程带宽横评',
    slugSeed: 'iepl-private-line-airports-peak-hour-benchmark',
    categories: ['机场评测'],
    tags: ['IEPL专线', '机场评测', '晚高峰测速', '丢包率实测', '高速节点'],
    keywordFocus: 'IEPL专线, 物理内网, 晚高峰不卡顿, 单线程带宽, 4K测速跑分'
  },
  {
    category: 'issues',
    titleSeed: 'Windows 11 系统更新后代理客户端 TUN 虚拟网卡失效与 DNS 泄漏深度修复',
    slugSeed: 'windows-11-tun-mode-dns-leak-fix',
    categories: ['故障排查'],
    tags: ['故障排查', 'TUN模式', 'DNS泄漏', 'Windows 11', '网络重置'],
    keywordFocus: 'Windows 11 TUN模式, 虚拟网卡报错, DNS污染, IPv6泄漏, 路由表冲突'
  },
  {
    category: 'recommend',
    titleSeed: '2026 外贸出海与跨境电商多店铺防关联原生静态住宅 IP 梯子选型指南',
    slugSeed: 'cross-border-ecommerce-static-residential-ip-guide',
    categories: ['机场推荐'],
    tags: ['机场推荐', '外贸梯子', '静态住宅IP', '跨境电商', '原生IP'],
    keywordFocus: '跨境电商网络, 静态独享IP, PayPal防风控, 亚马逊店铺防关联, 原生IP节点'
  },
  {
    category: 'wiki',
    titleSeed: '从零搞懂 BGP 跨境中继与物理内网专线的真实成本与架构差异',
    slugSeed: 'bgp-transit-vs-iepl-iplc-architecture-explained',
    categories: ['协议科普'],
    tags: ['科普', 'BGP中转', 'IEPL专线', '网络架构', '机场避坑'],
    keywordFocus: 'BGP中转机房, 物理专线成本, 入口汇聚, 跨境海缆, 机场运维内幕'
  },
  {
    category: 'tutorials',
    titleSeed: 'Shadowrocket iOS 配置文件精细化分流编写与本地 DNS 劫持防护实操',
    slugSeed: 'shadowrocket-ios-advanced-rules-and-dns-config',
    categories: ['客户端教程'],
    tags: ['Shadowrocket', '小火箭', 'iOS梯子', '规则编写', 'DNS防污染'],
    keywordFocus: 'Shadowrocket配置, 小火箭分流规则, HTTPS解密, 本地DNS防劫持, iOS网络'
  },
  {
    category: 'risk',
    titleSeed: '机场跑路全流程技术链剖析：从服务器欠费断网到管理团队失联的时间线特征',
    slugSeed: 'anatomy-of-airport-exit-scam-timeline-and-indicators',
    categories: ['安全风控'],
    tags: ['机场避坑', '跑路预警', '安全防护', '年付风险', '数据隐私'],
    keywordFocus: '机场跑路前兆, 充值大促销陷阱, 节点大面积红黄, 工单系统关闭, 避坑指南'
  },
  {
    category: 'compare',
    titleSeed: '轻度查资料与重度 4K 剪辑：2026 年付小流量梯子与无限流量专线选型权衡',
    slugSeed: 'budget-small-traffic-vs-unlimited-dedicated-lines',
    categories: ['机场评测'],
    tags: ['机场对比', '性价比机场', '便宜机场', '轻度办公', '大流量专线'],
    keywordFocus: '年付便宜梯子, 小流量套餐, 4K视频剪辑, 性价比排行, 选型指南'
  },
  {
    category: 'protocols',
    titleSeed: 'Hysteria 2 拥塞控制算法 Brutal 与 BBR 在高丢包恶劣弱网环境下的实测对比',
    slugSeed: 'hysteria2-brutal-vs-bbr-packet-loss-benchmark',
    categories: ['协议科普'],
    tags: ['Hysteria2', 'Brutal算法', 'BBR', '恶劣弱网', '抗丢包'],
    keywordFocus: 'Hysteria2 Brutal, BBR拥塞控制, UDP加速, 高丢包测试, 晚高峰翻墙'
  },
  {
    category: 'issues',
    titleSeed: 'Android 15 后台杀进程导致代理客户端断流与 Always-on VPN 电池白名单优化',
    slugSeed: 'android-15-battery-optimization-always-on-vpn-fix',
    categories: ['故障排查'],
    tags: ['Android教程', '后台断流', '电池优化', 'Always-on VPN', '故障排查'],
    keywordFocus: 'Android 15后台杀死, 代理断流, 锁屏断网, 电池无限制白名单, 保持后台长连'
  },
  {
    category: 'recommend',
    titleSeed: '2026 解锁 Claude 3.5 Sonnet 与 ChatGPT-4o 零封号风险的优质机场节点实测',
    slugSeed: 'ai-studio-claude-chatgpt-clean-ip-airports-2026',
    categories: ['机场推荐'],
    tags: ['ChatGPT梯子', 'Claude解锁', 'AI大模型', '机场推荐', '原生IP'],
    keywordFocus: 'Claude 3.5解封, ChatGPT 4o节点, 干净IP池, OpenAI地区不支持排查, AI专线'
  }
];

// 递归获取所有已有文件
function getAllExistingSlugs(dir) {
  let slugs = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      slugs = slugs.concat(getAllExistingSlugs(full));
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
      const rel = path.relative(BLOG_DIR, full).replace(/\\/g, '/');
      const slug = rel.replace(/\.mdx?$/, '');
      slugs.push(slug);
    }
  }
  return slugs;
}

// 挑选下一个待发布的独立主题 (防批量识别与主题重复)
function selectNextTopic(existingSlugs) {
  const existingSet = new Set(existingSlugs);

  // 1. 优先找种子库中未发布的
  for (const seed of TOPIC_SEEDS) {
    const fullSlug = `${seed.category}/${seed.slugSeed}`;
    if (!existingSet.has(fullSlug) && !existingSet.has(seed.slugSeed)) {
      return seed;
    }
  }

  // 2. 种子库用尽后，动态派生高质量长尾实测方向
  const timestamp = Date.now().toString(36).slice(-4);
  const randomCategory = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  return {
    category: randomCategory,
    titleSeed: `2026 网络代理实测系列：跨运营商物理链路与高并发吞吐深度调研报告 (${timestamp})`,
    slugSeed: `network-infrastructure-and-throughput-benchmark-${timestamp}`,
    categories: ['机场评测'],
    tags: ['专线测速', '网络架构', '晚高峰实测', '丢包率测试'],
    keywordFocus: '跨境专线性能, 弱网环境吞吐, 丢包率恢复, 多运营商实测'
  };
}

// 调用 DeepSeek 生成万字级技术专栏文章
async function generateArticleWithDeepSeek(topic) {
  console.log(`🤖 Invoking DeepSeek API for topic: "${topic.titleSeed}"...`);

  const prompt = `你是一名拥有10年网络架构、CDN 与跨境专线实测经验的资深网络安全与运维工程师。
现在请你为中文技术与科普知识库网站编写一篇万字级、深度透彻、专业可信的技术专栏文章。

【选题核心信息】
- 文章主标题：${topic.titleSeed}
- 核心分类：${topic.category}
- 核心聚焦关键词：${topic.keywordFocus}

【最高原则：反AI指纹与活人感（Anti-AI Fingerprint Standards）】
1. 绝对严禁空洞的AI套话和公文腔（严禁出现“在数字化浪潮的今天”、“总而言之”、“不仅如此，而且……”、“这就像一把双刃剑”、“显而易见的是”等空泛废话）。
2. 使用第一人称（如“我们在实测中发现”、“根据实际网络抓包数据”、“经过连续三晚的压测”），语气沉稳、专业、务实、有一说一。
3. 必须包含丰富具体的真实技术参数与实操数据（例如具体的 RTT 毫秒延迟、TCP 拥塞窗口、丢包重传率、MTU/MSS 分片大小、BBR 与 Cubic 算法对比表现）。
4. 必须包含格式清晰的 Markdown 表格（实测数据对比表）、可复现的配置代码块（如 Clash YAML 规则片段、iptables/路由表指令）、真实故障的排查步骤链。
5. 必须具备很强的深度与篇幅（字数必须极其充实，全文正文必须在 6,000 ~ 10,000 字左右，包含完整的技术推导和底层原理拆解）。
6. 文章末尾的【深度问答与避坑】部分，必须专门针对本文主题提出 4~6 个极其具体、具有高技术含量的疑难解答，绝对严禁复制宽泛通用的通用问答！

【文章结构规范】
1. 开篇引言：直击行业痛点或网络物理瓶颈，给出核心实测结论。
2. 核心架构与物理链路拆解（配合拓扑或机制说明）。
3. 真实环境实测数据评测（包含完整的不同运营商、不同时间段性能对比表格）。
4. 客户端或操作系统层面的高级调优配置（提供真实具体的代码块）。
5. 典型异常案例与网络抓包排查链路。
6. 本文专题核心疑难问答（4~6 个针对性硬核解答）。

【输出格式要求】
只输出 Markdown 格式正文内容（从一级标题 # 或二级标题 ## 开始），不要输出任何包裹标签，不要输出 Frontmatter（脚本会自动生成规范的 Frontmatter）。`;

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: '你是一名极其严谨、注重实测数据、语言干练有活人感的资深网络与 SEO 架构师。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 8192
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API failed with HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const rawBody = data.choices?.[0]?.message?.content?.trim();
  if (!rawBody || rawBody.length < 500) {
    throw new Error('DeepSeek returned empty or overly short content.');
  }

  return rawBody;
}

// 格式化当前日期为 ISO 格式
function getISODate() {
  const now = new Date();
  return now.toISOString();
}

// 主流程
async function run() {
  console.log('==================================================');
  console.log('🚀 Starting Automated SEO Matrix Publisher Engine');
  console.log('==================================================\n');

  const existingSlugs = getAllExistingSlugs(BLOG_DIR);
  console.log(`📊 Found ${existingSlugs.length} existing articles in repository.`);

  const topic = selectNextTopic(existingSlugs);
  console.log(`🎯 Selected Target Topic: [${topic.category}] ${topic.titleSeed}`);
  console.log(`🔗 Target URL Path: /${topic.category}/${topic.slugSeed}/\n`);

  // 1. 调用 DeepSeek 生成高质量长文正文
  const bodyContent = await generateArticleWithDeepSeek(topic);

  // 2. 提取 SEO 摘要 (Description)
  const cleanExcerpt = bodyContent
    .replace(/[#*`>\[\]\(\)\-\!\s]/g, ' ')
    .trim()
    .slice(0, 150) + '...';

  // 3. 构建严格符合 Astro strict schema 的 Frontmatter
  const frontmatter = `---
title: "${topic.titleSeed.replace(/"/g, '\\"')}"
date: ${getISODate()}
description: "${cleanExcerpt.replace(/"/g, '\\"')}"
categories:
  - "${topic.categories[0]}"
tags:
${topic.tags.map(t => `  - "${t}"`).join('\n')}
---

`;

  const fullMarkdown = frontmatter + bodyContent;

  // 4. 保存文件到对应分类子目录下 (自动融入 8 大父级分类聚合页)
  const targetDir = path.join(BLOG_DIR, topic.category);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const targetFilePath = path.join(targetDir, `${topic.slugSeed}.md`);
  fs.writeFileSync(targetFilePath, fullMarkdown, 'utf8');

  console.log(`\n✅ Article successfully created at:`);
  console.log(`   ${targetFilePath}`);
  console.log(`📝 Total length: ${fullMarkdown.length} characters`);
  console.log('==================================================\n');
}

run().catch((err) => {
  console.error('❌ Automation script encountered an error:', err);
  process.exit(1);
});
