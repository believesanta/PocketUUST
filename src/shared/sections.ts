export const sections = [
  { id: 'home', label: 'Главная' },
  { id: 'navigation', label: 'Аудитории' },
  { id: 'schedule', label: 'Расписание' },
  { id: 'student-life', label: 'Студенческая жизнь' },
  { id: 'community', label: 'Сообщество' },
  { id: 'services', label: 'Сервисы' },
  { id: 'forum', label: 'Форум' },
  { id: 'points', label: 'Баллы' },
] as const
export type AppSection = (typeof sections)[number]['id']
