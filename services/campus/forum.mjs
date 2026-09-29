// Forum persistence is shared by every client of the Campus API.
export class ForumStore {
  constructor(db, fail) {
    this.db = db
    this.fail = fail
    db.function('forum_lower', { deterministic: true }, (value) =>
      String(value).toLocaleLowerCase('ru-RU'),
    )
  }

  migrate() {
    this.db.exec(`
      ALTER TABLE forum_topics ADD COLUMN deleted_at INTEGER;
      ALTER TABLE forum_replies ADD COLUMN deleted_at INTEGER;
      ALTER TABLE forum_replies ADD COLUMN parent_id INTEGER REFERENCES forum_replies(id);
      CREATE TABLE forum_topic_likes (
        topic_id INTEGER NOT NULL REFERENCES forum_topics(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        PRIMARY KEY(topic_id,user_id)
      );
      CREATE TABLE forum_reply_likes (
        reply_id INTEGER NOT NULL REFERENCES forum_replies(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        PRIMARY KEY(reply_id,user_id)
      );
      CREATE TABLE forum_bookmarks (
        topic_id INTEGER NOT NULL REFERENCES forum_topics(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        PRIMARY KEY(topic_id,user_id)
      );
      CREATE INDEX forum_bookmarks_user ON forum_bookmarks(user_id,topic_id);
      CREATE INDEX forum_topics_category ON forum_topics(category,id) WHERE deleted_at IS NULL;
      CREATE INDEX forum_topics_user ON forum_topics(user_id,id) WHERE deleted_at IS NULL;
      PRAGMA user_version=2;
    `)
  }

  topic(id, viewerId = null) {
    const row = this.db
      .prepare(
        `SELECT t.*,u.name AS author,
      (SELECT count(*) FROM forum_replies r WHERE r.topic_id=t.id AND r.deleted_at IS NULL) AS replies,
      (SELECT count(*) FROM forum_topic_likes l WHERE l.topic_id=t.id) AS likes,
      EXISTS(SELECT 1 FROM forum_topic_likes l WHERE l.topic_id=t.id AND l.user_id=?) AS liked,
      EXISTS(SELECT 1 FROM forum_bookmarks b WHERE b.topic_id=t.id AND b.user_id=?) AS saved
      FROM forum_topics t JOIN users u ON u.id=t.user_id WHERE t.id=? AND t.deleted_at IS NULL
    `,
      )
      .get(viewerId, viewerId, id)
    return row
      ? {
          id: row.id,
          category: row.category,
          title: row.title,
          body: row.body,
          author: row.author,
          authorId: row.user_id,
          createdAt: new Date(row.created_at).toISOString(),
          replies: row.replies,
          likes: row.likes,
          liked: Boolean(row.liked),
          saved: Boolean(row.saved),
          canDelete: row.user_id === viewerId,
        }
      : null
  }

  reply(id, viewerId = null) {
    const row = this.db
      .prepare(
        `SELECT r.*,u.name AS author,
      (SELECT count(*) FROM forum_reply_likes l WHERE l.reply_id=r.id) AS likes,
      EXISTS(SELECT 1 FROM forum_reply_likes l WHERE l.reply_id=r.id AND l.user_id=?) AS liked,
      p.body AS parent_body,p.deleted_at AS parent_deleted_at,pu.name AS parent_author
      FROM forum_replies r JOIN users u ON u.id=r.user_id
      JOIN forum_topics t ON t.id=r.topic_id
      LEFT JOIN forum_replies p ON p.id=r.parent_id LEFT JOIN users pu ON pu.id=p.user_id
      WHERE r.id=? AND r.deleted_at IS NULL AND t.deleted_at IS NULL
    `,
      )
      .get(viewerId, id)
    return row
      ? {
          id: row.id,
          topicId: row.topic_id,
          body: row.body,
          author: row.author,
          authorId: row.user_id,
          createdAt: new Date(row.created_at).toISOString(),
          likes: row.likes,
          liked: Boolean(row.liked),
          canDelete: row.user_id === viewerId,
          parent: row.parent_id
            ? {
                id: row.parent_id,
                deleted: row.parent_deleted_at !== null,
                author: row.parent_deleted_at === null ? row.parent_author : null,
                body: row.parent_deleted_at === null ? row.parent_body.slice(0, 240) : null,
              }
            : null,
        }
      : null
  }

  list(query, page, viewerId, categories) {
    const category = query.get('category') ?? 'all'
    const scope = query.get('scope') ?? 'all'
    const sort = query.get('sort') ?? 'new'
    const search = (query.get('q') ?? '').trim()
    if (category !== 'all' && !categories.has(category)) this.fail(400, 'Неизвестная категория')
    if (!['all', 'mine', 'saved'].includes(scope) || !['new', 'top', 'unanswered'].includes(sort))
      this.fail(400, 'Неизвестный фильтр форума')
    if (scope !== 'all' && !viewerId) this.fail(401, 'Сначала войдите в аккаунт')
    if (search.length > 120) this.fail(400, 'Поиск: не более 120 символов')
    const beforeLikes = query.get('beforeLikes')
    if (
      beforeLikes !== null &&
      (!/^\d{1,15}$/.test(beforeLikes) ||
        !Number.isSafeInteger(Number(beforeLikes)) ||
        sort !== 'top')
    )
      this.fail(400, 'Некорректный указатель популярности')
    if (sort === 'top' && (page.before !== Number.MAX_SAFE_INTEGER) !== (beforeLikes !== null))
      this.fail(400, 'Укажите оба указателя страницы')
    const where = ['t.deleted_at IS NULL'],
      args = []
    if (category !== 'all') {
      where.push('t.category=?')
      args.push(category)
    }
    if (scope === 'mine') {
      where.push('t.user_id=?')
      args.push(viewerId)
    }
    if (scope === 'saved') {
      where.push('EXISTS(SELECT 1 FROM forum_bookmarks b WHERE b.topic_id=t.id AND b.user_id=?)')
      args.push(viewerId)
    }
    if (search) {
      where.push("instr(forum_lower(t.title || ' ' || t.body),?)>0")
      args.push(search.toLocaleLowerCase('ru-RU'))
    }
    if (sort === 'unanswered')
      where.push(
        'NOT EXISTS(SELECT 1 FROM forum_replies r WHERE r.topic_id=t.id AND r.deleted_at IS NULL)',
      )
    const condition = where.join(' AND ')
    const total = this.db
      .prepare(`SELECT count(*) AS n FROM forum_topics t WHERE ${condition}`)
      .get(...args).n
    const popular = sort === 'top'
    const score = '(SELECT count(*) FROM forum_topic_likes l WHERE l.topic_id=t.id)'
    const cursor =
      popular && beforeLikes !== null ? `AND (${score}<? OR (${score}=? AND t.id<?))` : 'AND t.id<?'
    const cursorArgs =
      popular && beforeLikes !== null
        ? [Number(beforeLikes), Number(beforeLikes), page.before]
        : [page.before]
    const rows = this.db
      .prepare(
        `SELECT t.id,${score} AS likes FROM forum_topics t WHERE ${condition} ${cursor}
      ORDER BY ${popular ? 'likes DESC,' : ''}t.id DESC LIMIT ?`,
      )
      .all(...args, ...cursorArgs, page.limit + 1)
    const visible = rows.slice(0, page.limit),
      hasMore = rows.length > page.limit
    const last = visible.at(-1)
    const counts = this.db
      .prepare(
        'SELECT category,count(*) AS count FROM forum_topics WHERE deleted_at IS NULL GROUP BY category',
      )
      .all()
    const stats = this.db
      .prepare(
        `SELECT
      (SELECT count(*) FROM forum_topics WHERE deleted_at IS NULL) AS topics,
      (SELECT count(*) FROM forum_replies r JOIN forum_topics t ON t.id=r.topic_id WHERE r.deleted_at IS NULL AND t.deleted_at IS NULL) AS replies,
      (SELECT count(*) FROM (SELECT user_id FROM forum_topics WHERE deleted_at IS NULL UNION SELECT r.user_id FROM forum_replies r JOIN forum_topics t ON t.id=r.topic_id WHERE r.deleted_at IS NULL AND t.deleted_at IS NULL)) AS authors`,
      )
      .get()
    return {
      topics: visible.map((x) => this.topic(x.id, viewerId)),
      total,
      hasMore,
      nextBeforeId: hasMore ? last.id : null,
      nextBeforeLikes: hasMore && popular ? last.likes : null,
      categories: Object.fromEntries(counts.map((x) => [x.category, x.count])),
      stats,
    }
  }

  detail(id, page, viewerId) {
    const topic = this.topic(id, viewerId)
    if (!topic) this.fail(404, 'Обсуждение удалено или не найдено')
    const rows = this.db
      .prepare(
        'SELECT id FROM forum_replies WHERE topic_id=? AND deleted_at IS NULL AND id<? ORDER BY id DESC LIMIT ?',
      )
      .all(id, page.before, page.limit + 1)
    const hasMore = rows.length > page.limit,
      visible = rows.slice(0, page.limit)
    return {
      topic,
      replies: visible.toReversed().map((x) => this.reply(x.id, viewerId)),
      totalReplies: topic.replies,
      hasMore,
      nextBeforeReplyId: hasMore ? visible.at(-1).id : null,
    }
  }

  interact(kind, id, action, body, userId, now) {
    const topic = kind === 'topics'
    const item = topic ? this.topic(id, userId) : this.reply(id, userId)
    if (!item) this.fail(404, 'Публикация удалена или не найдена')
    if (action === 'delete') {
      if (!item.canDelete) this.fail(403, 'Можно удалить только свою публикацию')
      // Keep the ID and reward ledger: deleting content must not reset daily reward caps.
      if (topic) {
        this.db
          .prepare("UPDATE forum_topics SET deleted_at=?,title='',body='' WHERE id=?")
          .run(now, id)
        this.db
          .prepare(
            "UPDATE forum_replies SET deleted_at=COALESCE(deleted_at,?),body='' WHERE topic_id=?",
          )
          .run(now, id)
        this.db.prepare('DELETE FROM forum_bookmarks WHERE topic_id=?').run(id)
      } else {
        this.db.prepare("UPDATE forum_replies SET deleted_at=?,body='' WHERE id=?").run(now, id)
      }
      return { deleted: true, id, ...(topic ? {} : { topic: this.topic(item.topicId, userId) }) }
    }
    const bookmark = action === 'bookmark'
    if (bookmark && !topic) this.fail(404, 'Не найдено')
    const enabled = body[bookmark ? 'saved' : 'liked']
    if (typeof enabled !== 'boolean') this.fail(400, 'Ожидается логическое значение действия')
    const table = bookmark ? 'forum_bookmarks' : topic ? 'forum_topic_likes' : 'forum_reply_likes'
    const key = topic ? 'topic_id' : 'reply_id'
    // Explicit state, not toggle: retrying the same request is safe.
    this.db
      .prepare(
        enabled
          ? `INSERT OR IGNORE INTO ${table}(${key},user_id) VALUES (?,?)`
          : `DELETE FROM ${table} WHERE ${key}=? AND user_id=?`,
      )
      .run(id, userId)
    return topic ? { topic: this.topic(id, userId) } : { reply: this.reply(id, userId) }
  }
}
