import nodemailer from 'nodemailer'

export function createMailer(settings) {
  const { smtpHost, smtpPort, smtpUser, smtpPassword, mailFrom, smtpSecure } = settings
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword || !mailFrom) return null
  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    requireTLS: !smtpSecure,
    auth: { user: smtpUser, pass: smtpPassword },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
    tls: { rejectUnauthorized: true },
  })
  return {
    async send(email, code, purpose) {
      const subject =
        purpose === 'register'
          ? 'Подтверждение регистрации PocketUUST'
          : 'Подтверждение почты PocketUUST'
      await transport.sendMail({
        from: mailFrom,
        to: email,
        subject,
        text: `Ваш код PocketUUST: ${code}\n\nКод действует 10 минут. Если вы не запрашивали код, проигнорируйте это письмо.`,
      })
    },
    close() {
      transport.close()
    },
  }
}
