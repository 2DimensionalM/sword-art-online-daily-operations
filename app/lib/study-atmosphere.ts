export type StudyPeriod = 'day' | 'night';
export type StudyWeather = 'clear' | 'cloudy' | 'overcast' | 'drizzle' | 'storm' | 'snow' | 'blizzard';

export const studyWeatherOptions: { value: StudyWeather; label: string; mark: string }[] = [
  { value: 'clear', label: '晴天', mark: '☀' },
  { value: 'cloudy', label: '多云', mark: '☁' },
  { value: 'overcast', label: '阴天', mark: '▰' },
  { value: 'drizzle', label: '小雨', mark: '☂' },
  { value: 'storm', label: '暴雨', mark: 'ϟ' },
  { value: 'snow', label: '下雪', mark: '❄' },
  { value: 'blizzard', label: '大雪', mark: '❄❄' },
];

// Computer-local hours, independent of app theme and the API's timing offset.
export function studyPeriodAt(date: Date): StudyPeriod {
  return date.getHours() >= 7 && date.getHours() < 19 ? 'day' : 'night';
}
