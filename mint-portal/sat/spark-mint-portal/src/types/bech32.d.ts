declare module 'bech32' {
  export const bech32: {
    decode: (addr: string) => { prefix: string; words: number[] };
    encode: (prefix: string, words: number[]) => string;
  };
  export const bech32m: {
    decode: (addr: string) => { prefix: string; words: number[] };
    encode: (prefix: string, words: number[]) => string;
  };
}
