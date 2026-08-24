import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Earth Engine for VS Code',
  tagline: 'Google Earth Engine directly inside your editor',
  favicon: 'icon.png',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  url: 'https://12rambau.github.io',
  baseUrl: '/',

  organizationName: '12rambau',
  projectName: 'earthengine-extension',

  staticDirectories: ['static', '../resources'],

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          path: 'docs',
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl:
            'https://github.com/12rambau/earthengine-extension/edit/main/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Earth Engine for VS Code',
      logo: {
        alt: 'Earth Engine for VS Code',
        src: 'icon.png',
      },
      items: [
        {
          to: '/getting-started',
          position: 'left',
          label: 'Documentation',
        },
        {
          type: 'html',
          className: 'navbar-icon-item',
          value:
            '<a class="navbar__item navbar-icon-link" href="https://marketplace.visualstudio.com/items?itemName=12rambau.earthengine" target="_blank" rel="noopener noreferrer" aria-label="VS Code Marketplace" title="VS Code Marketplace"><span class="navbar-vscode-icon" aria-hidden="true"></span></a>',
          position: 'right',
        },
        {
          type: 'html',
          className: 'navbar-icon-item',
          value:
            '<a class="navbar__item navbar-icon-link" href="https://open-vsx.org/extension/12rambau/earthengine" target="_blank" rel="noopener noreferrer" aria-label="Open VSX Registry" title="Open VSX Registry"><span class="navbar-open-vsx-icon" aria-hidden="true"></span></a>',
          position: 'right',
        },
        {
          type: 'html',
          className: 'navbar-icon-item navbar-icon-item-last',
          value:
            '<a class="navbar__item navbar-icon-link" href="https://github.com/12rambau/earthengine-extension" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository" title="GitHub repository"><span class="navbar-github-icon" aria-hidden="true"></span></a>',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting started',
              to: '/getting-started',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/12rambau/earthengine-extension',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Earth Engine for VS Code. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
