import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';
import { codegenNativeComponent } from 'react-native';

export type ReaderState = Readonly<{
  requestKey: string;
  phase: string;
  blockIndex: CodegenTypes.Int32;
}>;
export interface NativeProps extends ViewProps {
  bookId: string;
  editionId: string;
  blockIndex: CodegenTypes.Int32;
  requestKey: string;
  active: boolean;
  textZoomPercent?: CodegenTypes.WithDefault<CodegenTypes.Int32, 100>;
  onReaderState?: CodegenTypes.DirectEventHandler<ReaderState>;
}
// Deliberately no URI, HTML, script, headers, account, or Circle prop.
export default codegenNativeComponent<NativeProps>('SoeSourceReader') as HostComponent<NativeProps>;
