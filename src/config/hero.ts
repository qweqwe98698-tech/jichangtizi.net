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
    text: '2026 稳定梯子与高速机场推荐：全平台翻墙工具、专线评测与科学上网指南',
    subtitle: '严选高速稳定 IEPL/IPLC 专线梯子 · 实测 ChatGPT 解锁、4K 流媒体与多端客户端配置 · 数据驱动持续更新',
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
