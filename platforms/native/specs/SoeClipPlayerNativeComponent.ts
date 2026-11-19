import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';
import { codegenNativeComponent } from 'react-native';

export type ClipState = Readonly<{ requestKey: string; phase: string }>;
export interface NativeProps extends ViewProps {
  clipId: string;
  requestKey: string;
  playing: boolean;
  onClipState?: CodegenTypes.DirectEventHandler<ClipState>;
}
// The native host resolves the ID to a bundled derivative. No URL or token.
export default codegenNativeComponent<NativeProps>('SoeClipPlayer') as HostComponent<NativeProps>;
