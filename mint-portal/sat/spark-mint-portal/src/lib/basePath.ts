export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '/mint';
export const apiPath   = (p: string) => `${BASE_PATH}${p}`;
