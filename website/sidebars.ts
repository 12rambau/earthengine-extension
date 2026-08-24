import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'getting-started',
    'overview',
    {
      type: 'category',
      label: 'Sidebar sections',
      items: [
        'sections/profiles',
        'sections/assets',
        'sections/api-docs',
        'sections/export-tasks',
        'sections/import-tasks',
        'sections/dataset',
      ],
    },
    {
      type: 'category',
      label: 'Docked panels',
      items: ['panels/ee-export', 'panels/ee-import'],
    },
    {
      type: 'category',
      label: 'Webview editors',
      items: [
        'editors/asset-manager',
        'editors/image-preview',
        'editors/image-collection-preview',
        'editors/table-preview',
        'editors/export-tasks',
        'editors/import-tasks',
        'editors/dataset-details',
        'editors/interactive-map',
      ],
    },
    'commands',
    'settings',
  ],
};

export default sidebars;
