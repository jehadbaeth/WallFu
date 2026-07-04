export interface Intent {
  moveX: -1 | 0 | 1;
  jump: boolean;
  jumpPressed: boolean;
  fastFall: boolean;
  highPunch: boolean;
  highPunchPressed: boolean;
  lowPunch: boolean;
  lowPunchPressed: boolean;
  highKick: boolean;
  highKickPressed: boolean;
  lowKick: boolean;
  lowKickPressed: boolean;
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
    highPunch: false,
    highPunchPressed: false,
    lowPunch: false,
    lowPunchPressed: false,
    highKick: false,
    highKickPressed: false,
    lowKick: false,
    lowKickPressed: false,
    block: false,
    dash: false,
    dashPressed: false,
  };
}
