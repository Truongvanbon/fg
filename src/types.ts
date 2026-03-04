export interface VideoDimensions {
  width: number;
  height: number;
}

export interface LogoMask {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CustomLogo {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

export type AspectRatio = 'original' | '16:9' | '9:16' | '1:1' | '4:5';

export const ASPECT_RATIOS: Record<AspectRatio, number | null> = {
  original: null,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
  '4:5': 4 / 5,
};
