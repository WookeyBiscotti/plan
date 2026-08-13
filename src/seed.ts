import { addDays, mondayOnOrBefore, parseISO, todayISO, toISO } from './dates'
import type { ProjectState } from './types'

export const PEOPLE_COLORS = ['#c45c26', '#4f7f8b', '#8b6b4f', '#5c6b4a', '#7a4e5c', '#3f5f7a']

export function createSeed(): ProjectState {
  const planStart = mondayOnOrBefore(todayISO())
  const day = (offset: number) => toISO(addDays(parseISO(planStart), offset))

  return {
    planStart,
    people: [
      { id: 'anna', name: 'Анна Ковалева', role: 'Frontend', color: PEOPLE_COLORS[0] },
      { id: 'boris', name: 'Борис Левин', role: 'Backend', color: PEOPLE_COLORS[1] },
      { id: 'kira', name: 'Кира Орлова', role: 'Design', color: PEOPLE_COLORS[2] },
      { id: 'dmitry', name: 'Дмитрий Носов', role: 'Fullstack', color: PEOPLE_COLORS[3] },
    ],
    tasks: [
      {
        id: 'onboarding',
        title: 'Онбординг в кабинете',
        estimateDays: 3,
        parentId: null,
        assigneeId: 'anna',
        dependsOn: [],
        start: day(0),
      },
      {
        id: 'sessions',
        title: 'API сессий',
        estimateDays: 4,
        parentId: null,
        assigneeId: 'boris',
        dependsOn: [],
        start: day(0),
      },
      {
        id: 'onboarding-ui',
        title: 'Макеты онбординга',
        estimateDays: 2,
        parentId: null,
        assigneeId: 'kira',
        dependsOn: [],
        start: day(0),
      },
      {
        id: 'pay',
        title: 'Платежный шлюз',
        estimateDays: 12,
        parentId: null,
        assigneeId: null,
        dependsOn: [],
        start: day(7),
      },
      {
        id: 'pay-research',
        title: 'Выбор провайдера',
        estimateDays: 2,
        parentId: 'pay',
        assigneeId: 'kira',
        dependsOn: [],
        start: null,
      },
      {
        id: 'pay-api',
        title: 'API платежей',
        estimateDays: 4,
        parentId: 'pay',
        assigneeId: 'boris',
        dependsOn: ['pay-research'],
        start: null,
      },
      {
        id: 'pay-ui',
        title: 'UI чекаута',
        estimateDays: 3,
        parentId: 'pay',
        assigneeId: 'anna',
        dependsOn: ['pay-research'],
        start: null,
      },
      {
        id: 'pay-qa',
        title: 'Склейка и тесты',
        estimateDays: 3,
        parentId: 'pay',
        assigneeId: 'dmitry',
        dependsOn: ['pay-api', 'pay-ui'],
        start: null,
      },
      {
        id: 'catalog',
        title: 'Редизайн каталога',
        estimateDays: 8,
        parentId: null,
        assigneeId: null,
        dependsOn: [],
        start: null,
      },
      {
        id: 'analytics',
        title: 'Миграция аналитики',
        estimateDays: 6,
        parentId: null,
        assigneeId: null,
        dependsOn: [],
        start: null,
      },
      {
        id: 'push',
        title: 'Push-уведомления',
        estimateDays: 5,
        parentId: null,
        assigneeId: null,
        dependsOn: [],
        start: null,
      },
      {
        id: 'export',
        title: 'Экспорт отчётов',
        estimateDays: 4,
        parentId: null,
        assigneeId: null,
        dependsOn: [],
        start: null,
      },
      {
        id: 'mobile',
        title: 'Мобильное приложение',
        estimateDays: 20,
        parentId: null,
        assigneeId: null,
        dependsOn: [],
        start: null,
      },
    ],
  }
}
