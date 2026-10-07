import { useId } from 'react';
import { StudyDisplays } from './StudyDisplays';

const FOREGROUND = '/lockin/penthouse-foreground-v7.png';
const head = '700,320 949,320 952,510 874,579 747,546 699,465';
const leftHand = '416,594 495,591 504,654 408,656';
const rightHand = '1031,729 1115,727 1129,799 1030,817';
const chair = '440,710 811,777 938,857 872,941 377,941 400,807';

// Three reusable RGBA plates, native SVG masks and compositor transforms.
// No frame-by-frame React updates or WebGL loop: the person is a real separate layer.
export function StudyLife() {
  const prefix = useId().replace(/:/g, '');
  const clip = (name: string) => `url(#${prefix}-${name})`;
  return <>
    <svg className="study-city-life" viewBox="0 0 1672 941" aria-hidden="true">
      <StudyDisplays />
      <path className="scene-lamp-light" d="M193 359L282 389L224 451L153 411Z" />
    </svg>
    <svg className="study-foreground" viewBox="0 0 1672 941" aria-hidden="true">
      <defs>
        <clipPath id={`${prefix}-figure`}><polygon points="360,315 1140,315 1140,941 360,941" /></clipPath>
        <clipPath id={`${prefix}-head`}><polygon points={head} /></clipPath>
        <clipPath id={`${prefix}-left-hand`}><polygon points={leftHand} /></clipPath>
        <clipPath id={`${prefix}-right-hand`}><polygon points={rightHand} /></clipPath>
        <clipPath id={`${prefix}-chair`}><polygon points={chair} /></clipPath>
        <clipPath id={`${prefix}-vine`}><rect x="0" y="0" width="290" height="730" /></clipPath>
        <clipPath id={`${prefix}-plant`}><rect x="1360" y="430" width="312" height="511" /></clipPath>
        <mask id={`${prefix}-body`} maskUnits="userSpaceOnUse" x="0" y="0" width="1672" height="941"><rect width="1672" height="941" fill="white" />{[head, leftHand, rightHand, chair].map((points) => <polygon key={points} points={points} fill="black" />)}</mask>
      </defs>
      <g className="scene-vine"><image href={FOREGROUND} width="1672" height="941" clipPath={clip('vine')} /></g>
      <g className="scene-plant"><image href={FOREGROUND} width="1672" height="941" clipPath={clip('plant')} /></g>
      <g className="scene-posture"><g className="scene-breath">
        <image href={FOREGROUND} width="1672" height="941" clipPath={clip('figure')} mask={clip('body')} />
        <g className="scene-head"><image href={FOREGROUND} width="1672" height="941" clipPath={clip('head')} /></g>
        <g className="scene-typing"><image href={FOREGROUND} width="1672" height="941" clipPath={clip('left-hand')} /></g>
        <g className="scene-mouse"><image href={FOREGROUND} width="1672" height="941" clipPath={clip('right-hand')} /></g>
      </g></g>
      <image href={FOREGROUND} width="1672" height="941" clipPath={clip('chair')} />
    </svg>
  </>;
}
