/** Images bundled with the app: Metro resolves them to an asset reference for `<Image source>`. */
declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';
  const source: ImageSourcePropType;
  export default source;
}
