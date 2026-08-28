import defaultBackground from '../assets/blog-placeholder-1.webp';

/**
 * Hero copy and background settings for one page.
 */
export interface HeroSectionConfig {
  /**
   * Main hero headline text.
   */
  text: string;
  /**
   * Optional hero subtitle text.
   */
  subtitle?: string;
  /**
   * Hero background image URL.
   */
  backgroundImage: string;
}

/**
 * Centralized hero configuration for all top-level pages and post fallback.
 */
export interface HeroConfig {
  home: HeroSectionConfig;
  blog: HeroSectionConfig;
  tags: HeroSectionConfig;
  about: HeroSectionConfig;
  /**
   * Default hero image shared by all article pages.
   */
  postDefaultBackground: string;
}

export const heroConfig: HeroConfig = {
  home: {
    text: '2026 免费机场便宜稳定梯子VPN翻墙机场推荐与魔法梯子科学上网总控（持续更新中）',
    subtitle: '严选稳定、高性价比、流媒体与 ChatGPT 专线翻墙梯子 · 晚高峰实测数据驱动',
    backgroundImage: defaultBackground.src,
  },
  blog: {
    text: '机场梯子知识库',
    subtitle: '机场推荐、Clash / Mihomo、节点订阅、线路协议与常见问题解决指南',
    backgroundImage: defaultBackground.src,
  },
  tags: {
    text: 'Tags',
    subtitle: 'Explore topics by category and tag.',
    backgroundImage: defaultBackground.src,
  },
  about: {
    text: '关于机场梯子',
    subtitle: '专注机场推荐、机场评测、Clash / Mihomo 与网络工具使用指南',
    backgroundImage: defaultBackground.src,
  },
  postDefaultBackground: defaultBackground.src,
};
