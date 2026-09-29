import { t, localize } from '../../shared/i18n/index.ts'
import { useState, type FormEvent } from 'react'
import { moderateText, validProposal, type MemeProposal } from './model'
import { useLocal } from './useLocal'
import s from './Community.module.css'

const gallery = [
  {
    id: 'room',
    top: 'Я: знаю короткий путь',
    bottom: 'Тоже я: третий круг по корпусу',
    visual: 'route',
  },
  {
    id: 'deadline',
    top: 'До дедлайна — неделя',
    bottom: 'Неделя прошла за одну пару',
    visual: 'clock',
  },
  {
    id: 'exam',
    top: '«Этот вопрос не будет на экзамене»',
    bottom: 'Билет № 1: этот вопрос',
    visual: 'ticket',
  },
  { id: 'dorm', top: 'В общаге тихо', bottom: 'Значит, все уже на кухне', visual: 'mug' },
]
function Drawing({ kind }: { kind: string }) {
  return (
    <svg viewBox="0 0 240 120" className={s.memeDrawing} fill="none" aria-hidden="true">
      {kind === 'route' ? (
        <>
          <path
            d="M25 100V28h45v63h47V30h45v63h53"
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="25" cy="100" r="10" fill="currentColor" />
          <path
            d="m202 80 16 13-16 13"
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : kind === 'clock' ? (
        <>
          <circle cx="120" cy="61" r="43" stroke="currentColor" strokeWidth="6" />
          <path
            d="M120 27v35l29 16M62 26l-17-9M178 26l17-9"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path d="m17 62 33 0m141 0h33" stroke="currentColor" strokeWidth="3" />
        </>
      ) : kind === 'ticket' ? (
        <>
          <path d="M64 16h112v92H64Z" stroke="currentColor" strokeWidth="5" />
          <path d="M85 36h48m-48 15h72m-72 15h56" stroke="currentColor" strokeWidth="4" />
          <text x="143" y="96" fill="currentColor" fontSize="34" fontWeight="800">
            ?
          </text>
        </>
      ) : (
        <>
          <path
            d="M71 40h82v40a23 23 0 0 1-23 23H94a23 23 0 0 1-23-23V40Zm84 8h17c24 0 24 34 0 34h-17M96 27c-16-9 16-16 0-25m28 25c-16-9 16-16 0-25M54 110h133"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  )
}
export function Memes() {
  const {
    items: proposals,
    save,
    storageError,
  } = useLocal<MemeProposal>('pocketuust-community-memes-v1', validProposal)
  const {
    items: hidden,
    save: saveHidden,
    storageError: hideError,
  } = useLocal<string>(
    'pocketuust-community-hidden-v1',
    (value) => typeof value === 'string' && value.length < 100,
  )
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setStatus('')
    const issue = moderateText(text)
    if (issue) {
      setError(issue)
      return
    }
    if (
      save([
        { id: crypto.randomUUID(), text: text.trim(), createdAt: new Date().toISOString() },
        ...proposals,
      ])
    ) {
      setText('')
      setStatus(
        'Идея сохранена в локальной очереди. В галерее она появится только после редакционной проверки.',
      )
    }
  }
  return (
    <div>
      <div className={s.sectionIntro}>
        <div>
          <h3>{t("Между парами")}</h3>
          <p>{t("Четыре знакомые ситуации. Совпадения с вашей сессией ожидаемы.")}</p>
        </div>
        <button type="button" className={s.primary} onClick={() => setOpen(!open)}>
          {localize(open ? 'Закрыть форму' : 'Предложить мем')}
        </button>
      </div>
      <p className={s.localNote}>{t("Авторские текстовые мемы редакции PocketUUST. Без чужих фото и личных оскорблений. ")}</p>
      <div role="status" aria-live="polite" className={status ? s.notice : undefined}>
        {localize(status)}
      </div>
      {(storageError || hideError) && (
        <p role="alert" className={s.error}>
          {localize(storageError || hideError)}
        </p>
      )}
      {open && (
        <form className={s.formPanel} onSubmit={submit}>
          <h3>{t("Ваша ситуация из студенческой жизни")}</h3>
          <label>{t("Текст мема ")}<textarea
              required
              minLength={5}
              maxLength={240}
              rows={3}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t("Когда староста написал «завтра без первой пары»…")}
            />
          </label>
          <p className={s.small}>{t("Простая проверка грубых слов не заменяет человека. Все идеи требуют редакционной модерации. Пока очередь хранится в вашем браузере и не отправляется редакции автоматически. ")}</p>
          {error && (
            <p role="alert" className={s.error}>
              {localize(error)}
            </p>
          )}
          <button className={s.primary} type="submit">{t("Сохранить идею в очереди ")}</button>
          {proposals.length > 0 && (
            <div className={s.queue}>
              <h4>{t("Ваши идеи на проверку (")}{localize(proposals.length)})</h4>
              {proposals.map((item) => (
                <div className={s.queueItem} key={item.id}>
                  <p>
                    {localize(item.text)}
                    <small>{t("Ожидает модерации · локально")}</small>
                  </p>
                  <button
                    type="button"
                    onClick={() => save(proposals.filter((proposal) => proposal.id !== item.id))}
                  >{t("Удалить ")}</button>
                </div>
              ))}
            </div>
          )}
        </form>
      )}
      <div className={s.memeGrid}>
        {gallery
          .filter((item) => !hidden.includes(item.id))
          .map((item, index) => (
            <article key={item.id} className={`${s.memeCard} ${index % 2 ? s.memeAlternate : ''}`}>
              <div className={s.memePoster}>
                <p>{localize(item.top)}</p>
                <Drawing kind={item.visual} />
                <strong>{localize(item.bottom)}</strong>
              </div>
              <div className={s.memeFooter}>
                <span>{t("Редакционный мем")}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (saveHidden([...hidden, item.id]))
                      setStatus(
                        'Мем скрыт в этом браузере. Жалоба сохранена локально; отправка редакции пока не подключена.',
                      )
                  }}
                >{t("Пожаловаться и скрыть ")}</button>
              </div>
            </article>
          ))}
      </div>
      {hidden.length > 0 && (
        <button
          className={s.restore}
          type="button"
          onClick={() => {
            if (saveHidden([])) setStatus('Все редакционные мемы снова видны.')
          }}
        >{t("Показать скрытые мемы (")}{localize(hidden.length)})
        </button>
      )}
    </div>
  )
}
