import { t, localize } from '../../shared/i18n/index.ts'
import { useState } from 'react'
import { Board } from './Board'
import { Memes } from './Memes'
import { PastEvents } from './PastEvents'
import s from './Community.module.css'

const tabs = [
  { id: 'board', label: 'Барахолка' },
  { id: 'memes', label: 'Мемы' },
  { id: 'events', label: 'Прошедшие события' },
] as const
export function CommunityHub() {
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('board')
  return (
    <section className={s.community} aria-labelledby="community-heading">
      <div className={s.heading}>
        <div>
          <h2 id="community-heading">{t("Своё сообщество")}</h2>
          <p>{t("Вещи, шутки и воспоминания, которые объединяют кампус.")}</p>
        </div>
        <span className={s.cornerMark} aria-hidden="true">
          ☺
        </span>
      </div>
      <nav className={s.tabs} aria-label={t("Разделы сообщества")}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {localize(item.label)}
          </button>
        ))}
      </nav>
      {tab === 'board' ? <Board /> : tab === 'memes' ? <Memes /> : <PastEvents />}
    </section>
  )
}
