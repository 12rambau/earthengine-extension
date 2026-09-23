import type {ComponentProps} from 'react';
import MDXComponents from '@theme-original/MDXComponents';
import useBaseUrl from '@docusaurus/useBaseUrl';

type ImageProps = ComponentProps<'img'>;

function BaseUrlImage({src, ...props}: ImageProps) {
  return <img {...props} src={src ? useBaseUrl(src) : src} />;
}

export default {
  ...MDXComponents,
  img: BaseUrlImage,
};
