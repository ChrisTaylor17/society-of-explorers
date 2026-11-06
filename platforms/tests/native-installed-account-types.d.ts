// Narrow registered-app composition check, not native renderer/device acceptance.
declare module 'react-native' {
  export type ViewStyle = { [name: string]: unknown };
  export type StyleProp<T> = T | readonly StyleProp<T>[] | null | false;
  export type HostComponent<T> = import('react').ComponentType<T>;
  export const ActivityIndicator: import('react').ComponentType<{ [name: string]: unknown }>;
  export const UIManager: { getViewManagerConfig(name: string): object | null };
  export const Linking: { openURL(url: string): Promise<void> };
  export const Share: { share(content: { message: string; title?: string }): Promise<{ action: string }> };
  export function codegenNativeComponent<T>(name: string): HostComponent<T>;
  export namespace CodegenTypes {
    export type Int32 = number;
    export type DirectEventHandler<T> = (event: { nativeEvent: T }) => void;
  }
  export const TextInput: import('react').ComponentType<{
    [name: string]: unknown;
    onChangeText?: (value: string) => void;
  }>;
}
