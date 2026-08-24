import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';
import siteConfig from '@generated/docusaurus.config';

if (ExecutionEnvironment.canUseDOM) {
  const { extensionVersion } = siteConfig.customFields as { extensionVersion: string };
  document.documentElement.style.setProperty('--cosmos-version', `"v${extensionVersion}"`);
}
