import path from 'path';
import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../package.json') as { version: string };

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
  baseUrl:
    process.env.DEPLOYMENT_TARGET === 'github-pages' ? '/earthengine-extension/' : '/',

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

  customFields: {
    extensionVersion: version,
  },

  plugins: [
    // Sets --cosmos-version so the cosmos sidebar badge shows the extension version.
    function injectVersion() {
      return {
        name: 'inject-extension-version',
        getClientModules() {
          return [path.resolve(__dirname, 'src/versionBadge.ts')];
        },
      };
    },
  ],

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
          value:
            '<a class="navbar__item navbar__link" href="https://marketplace.visualstudio.com/items?itemName=12rambau.earthengine" target="_blank" rel="noopener noreferrer" aria-label="VS Code Marketplace" title="VS Code Marketplace"><span class="navbar-vscode-icon" aria-hidden="true"></span></a>',
          position: 'right',
        },
        {
          type: 'html',
          value:
            '<a class="navbar__item navbar__link" href="https://open-vsx.org/extension/12rambau/earthengine" target="_blank" rel="noopener noreferrer" aria-label="Open VSX Registry" title="Open VSX Registry"><span class="navbar-open-vsx-icon" aria-hidden="true"></span></a>',
          position: 'right',
        },
        {
          type: 'html',
          value:
            '<a class="navbar__item navbar__link" href="https://github.com/12rambau/earthengine-extension" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository" title="GitHub repository"><span class="navbar-github-icon" aria-hidden="true"></span></a>',
          position: 'right',
        },
      ],
    },
    footer: undefined,
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
