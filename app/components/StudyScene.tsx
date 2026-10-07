'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { studyPeriodAt, studyWeatherOptions, type StudyWeather } from '../lib/study-atmosphere';
import { StudyLife } from './StudyLife';
import { StudyAtmosphere } from './StudyAtmosphere';

// Original cel artwork; simulated weather is independent of the focus database.
export const StudyScene = memo(function StudyScene() {
  const [period, setPeriod] = useState(() => studyPeriodAt(new Date()));
  const [weather, setWeather] = useState<StudyWeather>('clear');
  const [running, setRunning] = useState(true);
  const weatherMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const refresh = () => { setPeriod(studyPeriodAt(new Date())); setRunning(!document.hidden); };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    // Warm both plates so crossing 07:00 / 19:00 does not reveal a blank frame.
    for (const scene of ['day', 'night']) {
      const plate = new Image();
      plate.src = `/lockin/penthouse-${scene}-v8.png`;
    }
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  function chooseWeather(value: StudyWeather) {
    setWeather(value);
    if (weatherMenu.current) {
      weatherMenu.current.open = false;
      weatherMenu.current.querySelector('summary')?.focus();
    }
  }
  const selected = studyWeatherOptions.find((item) => item.value === weather)!;
  return <>
    <div className="study-scene" data-period={period} data-weather={weather} data-running={running} aria-hidden="true"><div className="study-stage">
      <div className="study-art study-art-day" /><div className="study-art study-art-night" />
      <StudyLife />
      <StudyAtmosphere period={period} weather={weather} running={running} />
      <div className="study-ambient-light" />
    </div></div>
    <details ref={weatherMenu} className="space-weather">
      <summary aria-label={`切换天气，当前${selected.label}`}><span aria-hidden="true">{selected.mark}</span><strong>{selected.label}</strong><small>{period === 'day' ? 'DAY / 日间' : 'NIGHT / 夜间'}</small><b aria-hidden="true">⌃</b></summary>
      <div className="space-weather-menu" role="group" aria-label="手动切换天气"><header>WEATHER / 手动天气</header><div>{studyWeatherOptions.map((item) => <button type="button" key={item.value} aria-label={item.label} aria-pressed={weather === item.value} onClick={() => chooseWeather(item.value)}><i aria-hidden="true">{item.mark}</i><span>{item.label}</span></button>)}</div></div>
    </details>
  </>;
});
