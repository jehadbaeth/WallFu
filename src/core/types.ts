export interface Intent {
  moveX: -1 | 0 | 1;
  jump: boolean;
  jumpPressed: boolean;
  fastFall: boolean;
  light: boolean;
  lightPressed: boolean;
  heavy: boolean;
  heavyPressed: boolean;
  block: boolean;
  dash: boolean;
  dashPressed: boolean;
}

export function emptyIntent(): Intent {
  return {
    moveX: 0,
    jump: false,
    jumpPressed: false,
    fastFall: false,
    light: false,
    lightPressed: false,
    heavy: false,
    heavyPressed: false,
    block: false,
    dash: false,
    dashPressed: false,
  };
}
