/**
 * Site-level settings shared by header, SEO tags, and feed generation.
 */
export interface SiteConfig {
  /**
   * Canonical production URL of this site.
   */
  siteUrl: string;
  /**
   * Global site title used in header and metadata.
   */
  siteTitle: string;
  /**
   * Optional suffix appended to browser/SEO page titles.
   */
  siteTitleSuffix: string;
  /**
   * Default site description used by index and RSS metadata.
   */
  siteDescription: string;
  /**
   * BCP-47 locale tag (for example: zh-CN, en-US).
   */
  locale: string;
  /**
   * Repository URL shown in the header action area.
   */
  headerGithubRepoUrl: string;
  /**
   * Global favicon ico path served from the public directory.
   */
  faviconIco: string;
}

export const siteConfig: SiteConfig = {
  siteUrl: 'https://jichangtizi.net',
  siteTitle: '机场梯子',
  siteTitleSuffix: '2026 稳定机场推荐与梯子评测导航',
  siteDescription: '机场梯子 (jichangtizi.net) 专注于2026最新高速稳定科学上网机场推荐、Clash/Shadowrocket梯子评测与ChatGPT解锁专线实测。',
  locale: 'zh-CN',
  headerGithubRepoUrl: '',
  faviconIco: '/favicon.ico',
};

export const { siteUrl, siteTitle, siteTitleSuffix, siteDescription, locale, headerGithubRepoUrl, faviconIco } = siteConfig;
