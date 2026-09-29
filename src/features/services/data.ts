import directory from './faculty-directory.json' with { type: 'json' }
import type { Staff } from './model.ts'

export const faculties = directory.faculties
const iimrtSource = 'https://uust.ru/iimrt/direkcia/'
const iimrtStaff: Staff[] = [
  {
    id: 'iimrt-study-t',
    name: 'Федорова Наталья Ивановна',
    role: 'Заместитель директора по учебной работе (литера Т)',
    facultyId: 'faculty-2',
    phones: ['+7 (908) 350-21-73'],
    email: 'iimrt@uust.ru',
    office: 'ул. К. Маркса, 12, 6-420',
    sourceUrl: iimrtSource,
  },
  {
    id: 'iimrt-study-n',
    name: 'Ахметьянова Альбина Ильшатовна',
    role: 'Заместитель директора по учебной работе (литера Н)',
    facultyId: 'faculty-2',
    phones: ['+7 (347) 229-96-65'],
    email: 'iimrt@uust.ru',
    office: 'ул. Заки Валиди, 32А, ауд. 505',
    sourceUrl: iimrtSource,
  },
  {
    id: 'iimrt-youth',
    name: 'Узбекова Лилия Явгаровна',
    role: 'Заместитель директора по воспитательной работе',
    facultyId: 'faculty-2',
    phones: ['+7 (908) 350-21-73', '+7 (347) 229-96-65'],
    email: 'iimrt@uust.ru',
    office: 'ул. К. Маркса, 12, 6-320',
    sourceUrl: iimrtSource,
  },
  {
    id: 'iimrt-research',
    name: 'Кужаев Арсен Фанилевич',
    role: 'Заместитель директора по научной работе',
    facultyId: 'faculty-2',
    phones: ['+7 (347) 229-96-65', '+7 (908) 350-21-73'],
    email: 'iimrt@uust.ru',
    office: 'ул. Заки Валиди, 32А, ауд. 505',
    sourceUrl: iimrtSource,
  },
  {
    id: 'iimrt-projects',
    name: 'Белова Анна Сергеевна',
    role: 'Заместитель директора по развитию проектов и программ',
    facultyId: 'faculty-2',
    phones: ['+7 (347) 229-96-65'],
    email: 'belovaas@uust.ru',
    office: 'ул. Заки Валиди, 32А, ауд. 504',
    sourceUrl: iimrtSource,
  },
  {
    id: 'iimrt-career',
    name: 'Садриева Рита Тагировна',
    role: 'Заместитель директора по профориентационной работе',
    facultyId: 'faculty-2',
    phones: ['+7 (347) 229-96-65'],
    email: 'iimrt@uust.ru',
    office: 'ул. Заки Валиди, 32А, ауд. 505',
    sourceUrl: iimrtSource,
  },
]
export const administration: Staff[] = directory.staff
  .map<Staff>((person) =>
    person.facultyId === 'faculty-2'
      ? {
          ...person,
          phones: ['+7 (347) 229-96-65', '+7 (908) 350-21-73'],
          email: 'iimrt@uust.ru',
          office: 'ул. Заки Валиди, 32А, ауд. 505; ул. К. Маркса, 12, 6-420',
          sourceUrl: iimrtSource,
          contactNote: 'Контакты дирекции ИИМРТ. Часы работы на странице: 9:00–18:00.',
        }
      : person,
  )
  .concat(iimrtStaff)
const bsu = 'https://uust.ru/history/bsu/'
const usatu = 'https://uust.ru/history/usatu/'
export const history = [
  {
    year: '1909',
    title: 'Начало классической школы',
    text: '1 июля открылся Уфимский учительский институт — историческая основа будущего БашГУ.',
    sourceUrl: bsu,
    branch: 'Классическая школа',
  },
  {
    year: '1919',
    title: 'Институт народного образования',
    text: 'Учительский институт преобразован в Уфимский институт народного образования.',
    sourceUrl: 'https://uust.ru/ipch/history/geo/',
    branch: 'Классическая школа',
  },
  {
    year: '1929',
    title: 'Педагогический институт',
    text: 'Институт народного образования реорганизован в Башкирский государственный педагогический институт.',
    sourceUrl: 'https://uust.ru/fti/history/',
    branch: 'Классическая школа',
  },
  {
    year: '1932',
    title: 'Авиационная школа в Рыбинске',
    text: 'Создан Рыбинский авиационный институт для подготовки специалистов авиационной промышленности.',
    sourceUrl:
      'https://uust.ru/asu/publications/news/get/90-let-na-sluzhbe-nauke-obrazovaniyu-i-biznesu/',
    branch: 'Инженерная школа',
  },
  {
    year: '1941',
    title: 'Эвакуация в Уфу',
    text: 'Осенью Рыбинский авиационный институт эвакуирован в Уфу; в 1942 году получил название Уфимского авиационного института.',
    sourceUrl: usatu,
    branch: 'Инженерная школа',
  },
  {
    year: '1957',
    title: 'Создание БашГУ',
    text: '20 июля принято постановление об организации Башкирского государственного университета на базе педагогического института.',
    sourceUrl: bsu,
    branch: 'Классическая школа',
  },
  {
    year: '1992',
    title: 'Университетский статус УАИ',
    text: 'Уфимский авиационный институт получил статус технического университета — УГАТУ.',
    sourceUrl: usatu,
    branch: 'Инженерная школа',
  },
  {
    year: '2022',
    title: 'Две школы. Один университет.',
    text: '1 ноября начал свою историю Уфимский университет науки и технологий, объединивший БашГУ и УГАТУ.',
    sourceUrl: 'https://uust.ru/rectors-greeting/',
    branch: 'УУНиТ',
  },
]
