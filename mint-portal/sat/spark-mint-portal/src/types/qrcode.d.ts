declare module 'qrcode' {
  export function toDataURL(text: string, opts?: any): Promise<string>;
  export function toString(text: string, opts?: any): Promise<string>;
  const _default: {
    toDataURL: typeof toDataURL;
    toString: typeof toString;
  };
  export default _default;
}
